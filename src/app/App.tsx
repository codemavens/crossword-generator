import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { FontSummary, ProjectSummary } from "../core/api.ts";
import { isLibraryFontId } from "../core/api.ts";
import { defaultExportSettings, newProject, withCurrentDefaults } from "../core/models/defaults.ts";
import type { FontOutliner } from "../core/geometry/types.ts";
import { DEFAULT_LETTER_HEIGHT_RATIO } from "../core/geometry/crossword.ts";
import {
  assembleDesign,
  buildCrosswordPart,
  buildFramePart,
  designOpening,
  hasLayoutErrors,
  layoutIssuesFor,
} from "../core/design/buildDesign.ts";
import type { CrosswordPart, FramePart } from "../core/design/buildDesign.ts";
import type { ExportSettings, NameArtProject } from "../core/models/project.ts";
import {
  FRAME_LIMITS,
  LETTER_HEIGHT_RATIO_LIMITS,
  MAX_TILE_SIZE_MM,
  letterHeightRatioOk,
  validateNameText,
} from "../core/models/validation.ts";
import {
  centredLayout,
  largestTileSizeThatFits,
  minimumValidDiameter,
  movedLayout,
  smallestDiameterThatFits,
} from "../core/sizing/index.ts";
import {
  addDecoration,
  checkFit,
  eligibleDecorationSpots,
  removeDecorativeTile,
} from "../core/solver/index.ts";
import { duplicateProject } from "../core/models/duplicate.ts";
import { makeProjectFile, parseProjectImport } from "../core/models/projectImport.ts";
import { safeFileStem } from "../core/export/fileName.ts";
import { MAX_REQUEST_BYTES } from "../core/api.ts";
import { addArtwork, removeArtwork, setTileArtwork } from "../core/artwork/projectArtwork.ts";
import { readSvgFile } from "./artwork/readSvgFile.ts";
import { ApiRequestError, api } from "./api/client.ts";
import {
  DEFAULT_NAME_FONT_ID,
  DEFAULT_TILE_FONT_ID,
  DEFAULT_YEAR_FONT_ID,
  FONTS,
  MissingFontError,
  fontOptions,
  forgetFont,
  loadFont,
} from "./fonts.ts";
import { FontPanel, FONT_SETTING_LABELS } from "./components/FontPanel.tsx";
import type { FontSettingKey } from "./components/FontPanel.tsx";
import { FrameControls, NumberField, savedFrameProblem } from "./components/FrameControls.tsx";
import { ALL_LAYERS_ON, FramePreview } from "./components/FramePreview.tsx";
import type { Layers } from "./components/FramePreview.tsx";
import { downloadBlob } from "./download.ts";
import { ExportPanel } from "./components/ExportPanel.tsx";
import type { CrosswordOverlay, OverlayDrag, OverlaySpot } from "./components/FramePreview.tsx";
import { ProjectEditor, saveBlocked } from "./components/ProjectEditor.tsx";
import { ProjectList } from "./components/ProjectList.tsx";
import { TileEditor } from "./components/TileEditor.tsx";
import { SolverPanel } from "./components/SolverPanel.tsx";
import { useConfirm } from "./components/ConfirmDialog.tsx";
import { FontSample } from "./components/FontSample.tsx";
import { PreviewToolbar, SizeFitBar } from "./components/PreviewToolbar.tsx";
import { StepRail } from "./components/StepRail.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { ArrowIcon } from "./components/icons.tsx";
import { deleteProjectConfirm } from "./confirmations.ts";
import { STEP_IDS, STEP_LABELS, nextStep, stepStates } from "./steps.ts";
import type { StepFacts, StepId, ViewId } from "./steps.ts";

function tileSizeProblem(raw: string): string | null {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n)) return "Enter a number.";
  return n <= 0 || n > MAX_TILE_SIZE_MM ? `Must be above 0 and at most ${MAX_TILE_SIZE_MM}.` : null;
}

// Slider ranges; the number fields accept the full validated range.
const TILE_SLIDER = { min: 5, max: 40 };
// Range searched by "Largest that fits".
const TILE_SEARCH = { min: 1, max: MAX_TILE_SIZE_MM };
const LETTER_PERCENT = { min: LETTER_HEIGHT_RATIO_LIMITS.min * 100, max: LETTER_HEIGHT_RATIO_LIMITS.max * 100 };

function letterPercentProblem(raw: string): string | null {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n)) return "Enter a number.";
  return n < LETTER_PERCENT.min || n > LETTER_PERCENT.max
    ? `Must be between ${LETTER_PERCENT.min} and ${LETTER_PERCENT.max}.`
    : null;
}

const fontLabel = (id: string) => FONTS.find((f) => f.id === id)?.label ?? id;
const DEFAULT_FONT_FOR: Record<FontSettingKey, string> = {
  name: DEFAULT_NAME_FONT_ID,
  year: DEFAULT_YEAR_FONT_ID,
  tile: DEFAULT_TILE_FONT_ID,
};

type Fonts = Record<FontSettingKey, FontOutliner>;
type FontState =
  | { key: string; fonts: Fonts; missing: Record<FontSettingKey, string | null>; error: "" }
  | { key: string; fonts: null; missing: null; error: string };

const fmtMm = (n: number) => String(Math.round(n * 10) / 10);
// For a project object that somehow lacks export colours; kept stable so export files are not rebuilt each render.
const FALLBACK_EXPORT_SETTINGS = defaultExportSettings();

function describe(err: unknown): string[] {
  if (err instanceof ApiRequestError) {
    return [err.message, ...err.issues.map((i) => `${i.field}: ${i.message}`)];
  }
  return [err instanceof Error ? err.message : String(err)];
}

export function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<NameArtProject>(newProject);
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  // Changes when a different project is shown, so per-project session state (candidates) resets.
  const [session, setSession] = useState(0);
  // View state only, never saved with the project.
  const [view, setView] = useState<ViewId>("details");
  const [layers, setLayers] = useState<Layers>(ALL_LAYERS_ON);
  const [confirm, confirmDialog, cancelConfirm] = useConfirm();
  // App-level polite live region: async outcomes are announced even when their panel is hidden (AC29).
  const [announcement, setAnnouncement] = useState("");
  const viewRef = useRef(view);
  viewRef.current = view;
  const announceTimer = useRef<number | undefined>(undefined);
  // Only relayed when the source panel is hidden; a visible panel announces through its own message.
  const announceFrom = useCallback(
    (source: ViewId) => (message: string) => {
      if (!message || viewRef.current === source) return;
      setAnnouncement("");
      window.clearTimeout(announceTimer.current);
      announceTimer.current = window.setTimeout(() => setAnnouncement(message), 50);
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
    } catch (err) {
      setErrors(describe(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasErrors = useMemo(
    () => project.names.some((n) => validateNameText(n.text) !== null),
    [project.names],
  );

  // Bumped whenever the shown project is chosen, so a slower earlier load never replaces a later choice.
  const shownRequest = useRef(0);
  const [busy, setBusy] = useState(false);

  const show = (loaded: NameArtProject) => {
    setProject(withCurrentDefaults(loaded));
    setSession((n) => n + 1);
    setView("details");
  };

  const open = async (id: string) => {
    const request = ++shownRequest.current;
    setErrors([]);
    setStatus("");
    try {
      const record = await api.getProject(id);
      if (request === shownRequest.current) show(record.project);
    } catch (err) {
      if (request === shownRequest.current) setErrors(describe(err));
    }
  };

  // Creates a new project from `source` through the create route (the server assigns the id), then opens it.
  const createAndOpen = async (source: NameArtProject, done: string, reserved?: number) => {
    const request = reserved ?? ++shownRequest.current;
    setBusy(true);
    setErrors([]);
    setStatus("");
    try {
      const record = await api.createProject(source);
      await refresh();
      if (request === shownRequest.current) {
        show(record.project);
        setStatus(done);
      }
    } catch (err) {
      if (request === shownRequest.current) setErrors(describe(err));
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (p: ProjectSummary) => {
    const request = ++shownRequest.current;
    setBusy(true);
    setErrors([]);
    setStatus("");
    try {
      const record = await api.getProject(p.id);
      const created = await api.createProject(duplicateProject(withCurrentDefaults(record.project)));
      await refresh();
      if (request === shownRequest.current) {
        show(created.project);
        setStatus("Duplicated. You are now editing the copy.");
      }
    } catch (err) {
      if (request === shownRequest.current) setErrors(describe(err));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File) => {
    // Reserved before reading, so a project opened meanwhile is not replaced.
    const request = ++shownRequest.current;
    setErrors([]);
    setStatus("");
    if (file.size > MAX_REQUEST_BYTES) {
      setErrors([`The file is too large to import (limit ${Math.floor(MAX_REQUEST_BYTES / (1024 * 1024))} MB).`]);
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      if (request === shownRequest.current) setErrors(["The file could not be read."]);
      return;
    }
    if (request !== shownRequest.current) return;
    const parsed = parseProjectImport(text);
    if (!parsed.ok) {
      setErrors(["Nothing was imported.", ...parsed.messages]);
      return;
    }
    await createAndOpen(parsed.project, "Imported as a new project.", request);
  };

  const exportJson = () => {
    const json = JSON.stringify(makeProjectFile(project), null, 2);
    downloadBlob(new Blob([json], { type: "application/json" }), `${safeFileStem(project.projectName)}-project.json`);
  };

  const startNew = () => {
    shownRequest.current++;
    setErrors([]);
    setStatus("");
    setProject(newProject());
    setSession((n) => n + 1);
    setView("details");
  };

  // The deleted project's Delete button is gone after the list refreshes; move focus to New instead of losing it.
  const refocusAfterDelete = useRef(false);
  useEffect(() => {
    if (!refocusAfterDelete.current) return;
    refocusAfterDelete.current = false;
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) document.getElementById("project-new")?.focus();
  }, [projects]);

  // The project whose delete is being confirmed; the dialog closes if it vanishes from the list.
  const confirmingDelete = useRef<string | null>(null);
  useEffect(() => {
    const id = confirmingDelete.current;
    if (id !== null && !projects.some((p) => p.id === id)) cancelConfirm();
  }, [projects, cancelConfirm]);

  const remove = async (p: ProjectSummary) => {
    confirmingDelete.current = p.id;
    const ok = await confirm(deleteProjectConfirm(p.projectName));
    confirmingDelete.current = null;
    if (!ok) return;
    setErrors([]);
    try {
      await api.deleteProject(p.id);
      refocusAfterDelete.current = true;
      if (project.id === p.id) {
        shownRequest.current++;
        setProject(newProject());
        setSession((n) => n + 1);
      }
      await refresh();
    } catch (err) {
      setErrors(describe(err));
    }
  };

  const save = async () => {
    setSaving(true);
    setErrors([]);
    setStatus("");
    const submitted = project;
    try {
      const record =
        submitted.id === ""
          ? await api.createProject(submitted)
          : await api.updateProject(submitted.id, submitted);
      // Keep edits made while the save was in flight; only adopt the new id.
      setProject((current) => {
        if (current === submitted) return record.project;
        return current.id === submitted.id ? { ...current, id: record.project.id } : current;
      });
      setStatus("Saved.");
      await refresh();
    } catch (err) {
      setErrors(describe(err));
    } finally {
      setSaving(false);
    }
  };

  const frame = project.settings.frame;
  const lettering = project.settings.lettering;
  const fontIds: Record<FontSettingKey, string> = {
    name: frame.familyNameFontId || DEFAULT_NAME_FONT_ID,
    year: frame.yearFontId || DEFAULT_YEAR_FONT_ID,
    tile: lettering?.tileFontId || DEFAULT_TILE_FONT_ID,
  };
  const showScores = lettering?.showScores ?? true;
  const letterHeightRatio = lettering?.letterHeightRatio;

  // Font library: the merged picker list and which project fonts are available.
  const [library, setLibrary] = useState<FontSummary[] | null>(null);
  const [libraryError, setLibraryError] = useState("");
  const libraryRequest = useRef(0);
  const refreshLibrary = useCallback(async () => {
    const request = ++libraryRequest.current;
    try {
      const list = await api.listFonts();
      if (request !== libraryRequest.current) return;
      setLibrary(list);
      setLibraryError("");
    } catch {
      if (request !== libraryRequest.current) return;
      setLibraryError("The font library could not be read, so added fonts are not available right now.");
    }
  }, []);
  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);
  const options = useMemo(() => fontOptions(library ?? []), [library]);
  const libraryKey = library === null ? `none:${libraryError}` : library.map((f) => f.id).join(",");

  const removeLibraryFont = async (font: FontSummary) => {
    try {
      await api.deleteFont(font.id);
    } catch (err) {
      if (!(err instanceof ApiRequestError && err.status === 404)) throw err;
    }
    forgetFont(font.id);
    await refreshLibrary();
  };

  const fontKey = JSON.stringify([fontIds.name, fontIds.year, fontIds.tile]);
  const [fontState, setFontState] = useState<FontState | null>(null);
  useEffect(() => {
    let cancelled = false;
    const { name: nameId, year: yearId, tile: tileId } = fontIds;
    // A missing font is drawn with the setting's default; the project keeps its own font id.
    const resolve = async (key: FontSettingKey, id: string): Promise<{ font: FontOutliner; missing: string | null }> => {
      if (isLibraryFontId(id) && library !== null && !library.some((f) => f.id === id)) {
        return { font: await loadFont(DEFAULT_FONT_FOR[key]), missing: "The font is not in the font library." };
      }
      try {
        return { font: await loadFont(id), missing: null };
      } catch (err) {
        if (!(err instanceof MissingFontError)) throw err;
        return { font: await loadFont(DEFAULT_FONT_FOR[key]), missing: err.message };
      }
    };
    Promise.all([resolve("name", nameId), resolve("year", yearId), resolve("tile", tileId)])
      .then(([name, year, tile]) => {
        if (cancelled) return;
        setFontState({
          key: fontKey,
          fonts: { name: name.font, year: year.font, tile: tile.font },
          missing: { name: name.missing, year: year.missing, tile: tile.missing },
          error: "",
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setFontState({ key: fontKey, fonts: null, missing: null, error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
    // fontIds and `library` are represented by fontKey and libraryKey.
  }, [fontKey, libraryKey]);
  // Results for other font ids (a previous project or choice) are never drawn.
  const current = fontState?.key === fontKey ? fontState : null;
  const fonts = current?.fonts ?? null;
  const fontError = current?.error ?? "";
  // Stage C: export is blocked while this is non-empty (or while fonts are still loading).
  const missingFonts: string[] = current?.missing
    ? (["name", "year", "tile"] as const).filter((k) => current.missing[k] !== null).map((k) => FONT_SETTING_LABELS[k])
    : [];
  const setFontId = (key: FontSettingKey, id: string) =>
    setProject((p) => {
      const s = p.settings;
      if (key === "tile") return { ...p, settings: { ...s, lettering: { ...s.lettering, tileFontId: id } } };
      const f = key === "name" ? { ...s.frame, familyNameFontId: id } : { ...s.frame, yearFontId: id };
      return { ...p, settings: { ...s, frame: f } };
    });

  // Same steps as buildDesign (src/core/design), memoised separately so dragging and edits rebuild only what changed.
  const framePart = useMemo<FramePart>(
    () =>
      fonts
        ? buildFramePart({ familyName: project.familyName, year: project.year, settings: { frame } }, fonts)
        : { frame: null, error: "" },
    [fonts, project.familyName, project.year, frame],
  );

  const tileSizeMm = project.settings.tileSizeMm;
  const geometry = framePart.frame;
  const layout = project.selectedLayout;

  const [editEnds, setEditEnds] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sizeMessage, setSizeMessage] = useState("");
  // Which button the size message answers, so it shows beside that button.
  const [sizeSource, setSizeSource] = useState<"tile" | "diameter">("tile");
  const projectRef = useRef(project);
  projectRef.current = project;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const layoutId = layout?.id;
  // Edit mode belongs to one arrangement of one project.
  useEffect(() => {
    setEditEnds(false);
    setEditMessage("");
    setSizeMessage("");
  }, [session, layoutId]);
  // The tile editor follows the same boundaries, and ends with edit mode or its tile.
  const selectedTile = editEnds ? layout?.decorativeTiles.find((d) => d.id === selectedTileId) : undefined;
  useEffect(() => {
    setSelectedTileId(null);
  }, [session, layoutId, editEnds]);
  useEffect(() => {
    setUploadMessage("");
    setUploadWarnings([]);
  }, [selectedTileId, session, layoutId]);

  const pickArtwork = (artworkId: string | null) => {
    if (!selectedTile) return;
    const tileId = selectedTile.id;
    setProject((p) => (p.selectedLayout ? { ...p, selectedLayout: setTileArtwork(p.selectedLayout, tileId, artworkId) } : p));
  };

  const uploadArtwork = async (file: File) => {
    if (!selectedTile) return;
    const tileId = selectedTile.id;
    const startLayoutId = layoutId;
    const startSession = session;
    setUploadMessage("");
    setUploadWarnings([]);
    setUploading(true);
    try {
      const converted = await readSvgFile(file);
      if (!converted.ok) {
        setUploadMessage(converted.message);
        return;
      }
      // A different project was opened while reading: drop the result.
      if (sessionRef.current !== startSession) return;
      const current = projectRef.current;
      const added = addArtwork(current, converted.asset);
      if (!added.ok) {
        setUploadMessage(added.message);
        return;
      }
      // Apply to the tile only if the same arrangement and tile are still showing.
      const sameLayout = current.selectedLayout?.id === startLayoutId;
      const next =
        sameLayout && current.selectedLayout
          ? { ...added.project, selectedLayout: setTileArtwork(current.selectedLayout, tileId, added.artworkId) }
          : added.project;
      setProject(next);
      setUploadWarnings(converted.warnings);
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const layoutIssues = useMemo(() => layoutIssuesFor(project.names, layout), [layout, project.names]);
  const layoutStale = !!layout && hasLayoutErrors(layoutIssues);
  // Keyed on the centroid's numbers so frame edits that do not move the opening keep the same piece.
  const centroidX = geometry?.usableOpening.centroid.x;
  const centroidY = geometry?.usableOpening.centroid.y;
  const tileFont = fonts?.tile;
  const piece = useMemo<CrosswordPart>(() => {
    if (!tileFont || centroidX === undefined || centroidY === undefined) return { crossword: null, originMm: null, error: "" };
    return buildCrosswordPart({
      names: project.names,
      layout,
      layoutIssues,
      artwork: project.artwork,
      tileSizeMm,
      showScores,
      letterHeightRatio,
      centroidMm: { x: centroidX, y: centroidY },
      tileFont,
    });
  }, [layout, layoutIssues, project.names, project.artwork, tileFont, showScores, letterHeightRatio, tileSizeMm, centroidX, centroidY]);

  const clearanceMm = frame.crosswordClearanceMm;
  const opening = useMemo(() => (geometry ? designOpening(geometry, tileSizeMm, clearanceMm) : null), [geometry, tileSizeMm, clearanceMm]);
  // Fit at the saved offset; this is what export checks.
  const savedFit = useMemo(
    () => (opening && layout && piece.crossword ? checkFit(layout, project.names, opening) : null),
    [opening, layout, project.names, piece.crossword],
  );
  const design = useMemo(
    () => assembleDesign({ layout, framePart, layoutIssues, crosswordPart: piece, opening, fit: savedFit }),
    [layout, framePart, layoutIssues, piece, opening, savedFit],
  );

  // Dragging: the piece is shifted on screen and fit is rechecked live; the offset is saved on release.
  const [drag, setDrag] = useState<{ key: string; dx: number; dy: number } | null>(null);
  const dragKey = `${session}:${layoutId ?? ""}`;
  const dragStartKey = useRef<string | null>(null);
  const liveDragKey = () => `${sessionRef.current}:${projectRef.current.selectedLayout?.id ?? ""}`;
  const dragging = drag && drag.key === dragKey && !editEnds ? drag : null;
  // The layout as shown: the saved one, moved by any drag in progress (rounded like the saved offset).
  const shownLayout = layout && dragging ? movedLayout(layout, dragging.dx, dragging.dy) : layout;

  const crossword = useMemo(() => {
    if (!layout) return { overlay: null, state: "none" as const, outsideCount: 0 };
    if (layoutStale) return { overlay: null, state: "stale" as const, outsideCount: 0 };
    if (!geometry || !piece.crossword || !piece.originMm || !opening || !savedFit) {
      return { overlay: null, state: "pending" as const, outsideCount: 0 };
    }
    // Rechecked live while dragging; otherwise the saved-offset fit.
    const fit = shownLayout && shownLayout !== layout ? checkFit(shownLayout, project.names, opening) : savedFit;
    const nameText = (id: string) => (project.names.find((n) => n.id === id)?.text ?? "").trim().toUpperCase();
    const where = (end: "start" | "end") => (end === "start" ? "before" : "after");
    const editing = editEnds
      ? {
          spots: eligibleDecorationSpots(project.names, layout).map(
            (s): OverlaySpot => ({
              nameId: s.nameId,
              end: s.end,
              x: s.position.x,
              y: s.position.y,
              label: `Add decorative tile ${where(s.end)} ${nameText(s.nameId)}`,
            }),
          ),
          onAdd: (spot: OverlaySpot) => {
            const result = addDecoration(project.names, layout, { nameId: spot.nameId, end: spot.end });
            if (result.ok) {
              setEditMessage("");
              setProject((p) => ({ ...p, selectedLayout: result.layout }));
              setSelectedTileId(result.layout.decorativeTiles.at(-1)?.id ?? null);
            } else {
              setEditMessage(result.message);
            }
          },
          onSelect: (tileId: string) => {
            setEditMessage("");
            setSelectedTileId(tileId);
          },
        }
      : null;
    const overlay: CrosswordOverlay = {
      piece: piece.crossword,
      decorations: layout.decorativeTiles.map((d) => ({
        id: d.id,
        x: d.position.x,
        y: d.position.y,
        source: d.source,
        label: `${d.purpose === "connector" ? "Connector" : "Decorative tile"}${
          editEnds ? ` ${where(d.anchor.end)} ${nameText(d.anchor.nameId)}` : ""
        }`,
        selected: d.id === selectedTileId,
      })),
      editing,
      originMm: piece.originMm,
      tileSizeMm,
      outside: new Set(fit.tilesOutside.map((t) => `${t.x},${t.y}`)),
      translate: shownLayout
        ? { x: shownLayout.offset.xMm - layout.offset.xMm, y: shownLayout.offset.yMm - layout.offset.yMm }
        : { x: 0, y: 0 },
      drag: null,
    };
    return { overlay, state: "shown" as const, outsideCount: fit.tilesOutside.length };
  }, [layout, shownLayout, layoutStale, piece, project.names, geometry, opening, savedFit, tileSizeMm, editEnds, selectedTileId]);

  const moveBy = (dx: number, dy: number) =>
    setProject((p) => (p.selectedLayout ? { ...p, selectedLayout: movedLayout(p.selectedLayout, dx, dy) } : p));
  const dragHandlers: OverlayDrag = {
    onStart: () => {
      dragStartKey.current = dragKey;
      setDrag({ key: dragKey, dx: 0, dy: 0 });
    },
    onMove: (dx, dy) => {
      const key = dragStartKey.current;
      if (key !== null && key === liveDragKey()) setDrag({ key, dx, dy });
    },
    onEnd: (dx, dy, commit) => {
      const key = dragStartKey.current;
      dragStartKey.current = null;
      setDrag(null);
      // A drag started on another project or arrangement is dropped.
      if (!commit || key === null || key !== liveDragKey() || (dx === 0 && dy === 0)) return;
      const startLayoutId = key.slice(key.indexOf(":") + 1);
      setProject((p) =>
        p.selectedLayout && p.selectedLayout.id === startLayoutId
          ? { ...p, selectedLayout: movedLayout(p.selectedLayout, dx, dy) }
          : p,
      );
    },
    onNudge: moveBy,
  };
  const overlay: CrosswordOverlay | null =
    crossword.overlay && !editEnds ? { ...crossword.overlay, drag: dragHandlers } : crossword.overlay;

  const canResize = crossword.state === "shown" && !!layout && !!geometry;
  const largestTile = () => {
    if (!layout || !geometry) return;
    const size = largestTileSizeThatFits({
      names: project.names,
      layout,
      opening: geometry.usableOpening,
      clearanceMm: frame.crosswordClearanceMm,
      ...TILE_SEARCH,
    });
    setSizeSource("tile");
    if (size === null) {
      setSizeMessage(
        `No tile size from ${TILE_SEARCH.min} to ${TILE_SEARCH.max} mm fits in the current position. Move the crossword or make the frame larger.`,
      );
      return;
    }
    setSizeMessage("");
    setProject((p) => ({ ...p, settings: { ...p.settings, tileSizeMm: size } }));
  };
  const smallestDiameter = () => {
    if (!layout || !fonts) return;
    const d = smallestDiameterThatFits({
      familyName: project.familyName,
      year: project.year,
      frame,
      nameFont: fonts.name,
      yearFont: fonts.year,
      names: project.names,
      layout,
      tileSizeMm,
      min: FRAME_LIMITS.outerDiameterMm.min,
      max: FRAME_LIMITS.outerDiameterMm.max,
    });
    setSizeSource("diameter");
    if (d === null) {
      setSizeMessage(
        `No diameter up to ${FRAME_LIMITS.outerDiameterMm.max} mm fits the crossword at this tile size and position. Reduce the tile size or move the crossword.`,
      );
      return;
    }
    setSizeMessage("");
    setProject((p) => ({ ...p, settings: { ...p.settings, frame: { ...p.settings.frame, outerDiameterMm: d } } }));
  };
  const setTileSize = (n: number) => setProject((p) => ({ ...p, settings: { ...p.settings, tileSizeMm: n } }));
  const setLettering = (patch: Partial<NameArtProject["settings"]["lettering"]>) =>
    setProject((p) => ({ ...p, settings: { ...p.settings, lettering: { ...p.settings.lettering, ...patch } } }));
  const bounds = piece.crossword?.bounds;
  const offset = shownLayout?.offset;
  const pieceErrors = piece.crossword?.problems.filter((p) => p.severity === "error") ?? [];
  const missingGlyphs = [...new Set(pieceErrors.filter((p) => p.code === "missing-glyph").map((p) => p.char ?? ""))];

  // Export: font problems block it alongside the design's own blockers.
  const fontBlockers: string[] = !current
    ? ["The fonts are still loading."]
    : fontError
      ? [`The fonts could not be loaded: ${fontError}`]
      : missingFonts.map((label) => `${label}: the chosen font is not available. Choose a font in the Fonts section.`);
  const exportSettings = project.settings.export ?? FALLBACK_EXPORT_SETTINGS;
  const setExportSettings = (next: ExportSettings) =>
    setProject((p) => ({ ...p, settings: { ...p.settings, export: next } }));
  // The fit confirmation is asked again when the arrangement, its position, a size or the fit changes.
  const confirmKey = JSON.stringify([session, layout ?? null, tileSizeMm, frame, savedFit?.tilesOutside ?? null]);

  // Step rail: completion is read from what the app already computes, never stored (AC9).
  const [fieldProblems, setFieldProblems] = useState<Record<string, boolean>>({});
  const reportFieldProblem = useCallback(
    (id: string, bad: boolean) => setFieldProblems((p) => (!!p[id] === bad ? p : { ...p, [id]: bad })),
    [],
  );
  const [runState, setRunState] = useState({ busy: false, problem: "" });
  const [rank, setRank] = useState<{ index: number; count: number } | null>(null);
  const optionLabel = (id: string) =>
    options.find((o) => o.id === id)?.label ?? (library === null && !libraryError ? "Loading…" : "Missing font");
  const exportReady = fontBlockers.length === 0 && design.exportBlockers.length === 0;
  const facts: StepFacts = {
    projectName: project.projectName,
    nameCount: project.names.length,
    namesInvalid: hasErrors,
    arrangementChosen: !!layout,
    arrangementStale: layoutStale,
    arrangementRank: rank,
    fontsLoading: !current,
    fontsFailed: fontError !== "",
    missingFontCount: missingFonts.length,
    fontNames: [fontIds.name, fontIds.year, fontIds.tile].map(optionLabel),
    frameFieldProblem:
      Object.entries(fieldProblems).some(([id, bad]) => bad && id.startsWith("frame-")) || savedFrameProblem(frame),
    frameBuilt: framePart.frame !== null,
    outerDiameterMm: frame.outerDiameterMm,
    tileSizeValid: !fieldProblems.tileSize && tileSizeProblem(String(tileSizeMm)) === null,
    letterSizeValid:
      !fieldProblems.letterSize && (letterHeightRatio === undefined || letterHeightRatioOk(letterHeightRatio)),
    tileSizeMm,
    exportReady,
  };
  const steps = stepStates(facts, view);
  const stepState = (id: StepId) => steps[STEP_IDS.indexOf(id)]!;
  const canOpen = (id: StepId) => stepState(id).openable;
  // From inside a panel (Next, "Fix in…"), the focused button is about to be hidden, so focus the new panel's heading.
  const focusHeading = useRef(false);
  const goTo = (id: ViewId, fromPanel = false) => {
    if (id !== "projects" && !canOpen(id)) return;
    focusHeading.current = fromPanel;
    setView(id);
  };
  const goFromPanel = (id: ViewId) => goTo(id, true);

  // A newly chosen view starts at the top of the control panel.
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    panelRef.current?.scrollTo?.({ top: 0 });
    if (focusHeading.current) {
      focusHeading.current = false;
      document.getElementById(`panel-${view}-heading`)?.focus();
    }
  }, [view]);

  const glyphMessages = new Set(pieceErrors.filter((p) => p.code === "missing-glyph").map((p) => p.message));

  const editButton = (
    <button
      type="button"
      className={editEnds ? "toggle-on" : undefined}
      aria-pressed={editEnds}
      disabled={crossword.state !== "shown"}
      onClick={() => {
        setEditEnds(!editEnds);
        setEditMessage("");
      }}
    >
      {editEnds ? "Done editing end tiles" : "Edit end tiles"}
    </button>
  );

  const sizeNote = (source: "tile" | "diameter") =>
    sizeMessage && sizeSource === source ? (
      <p className="banner warn" role="status">
        {sizeMessage}
      </p>
    ) : null;

  const fontNotes: Partial<Record<FontSettingKey, ReactNode>> = {};
  const fontSamples: Partial<Record<FontSettingKey, ReactNode>> = {};
  const sampleText: Record<FontSettingKey, string> = {
    name: project.familyName.trim() || "Family",
    year: project.year?.trim() || String(new Date().getFullYear()),
    tile: "ABC",
  };
  for (const k of ["name", "year", "tile"] as const) {
    const missing = current?.missing?.[k];
    if (missing) {
      fontNotes[k] = (
        <p className="banner warn" role="alert">
          {FONT_SETTING_LABELS[k]}: the chosen font is not available. {missing} The preview uses{" "}
          {fontLabel(DEFAULT_FONT_FOR[k])} instead. Choose a font before exporting.
        </p>
      );
    } else if (fonts) {
      fontSamples[k] = <FontSample font={fonts[k]} text={sampleText[k]} />;
    }
  }

  // AC8a: say beside Generate why there is no frame to generate in.
  const generateFrameNote = fontError ? (
    <span className="small note-warn" role="status">
      The fonts could not be loaded, so there is no frame to generate in. Choose another font in the Fonts step.{" "}
      {canOpen("fonts") && (
        <button type="button" className="link-button" onClick={() => goFromPanel("fonts")}>
          Open Fonts
        </button>
      )}
    </span>
  ) : framePart.error ? (
    <span className="small note-error" role="status">
      Could not build the frame: {framePart.error}
    </span>
  ) : !current ? (
    <span className="muted small">Loading fonts…</span>
  ) : null;

  // Why the preview has no crossword (AC8): it is generated from the names, so say where that stands.
  const previewNote = hasErrors
    ? "Fix the names to see the crossword."
    : project.names.length === 0
      ? "Add a name to see the crossword."
      : !geometry
        ? generateFrameNote ?? "There is no frame to arrange the crossword in yet."
        : runState.busy
          ? "Generating…"
          : runState.problem || "Generating…";

  const PANEL_TEXT: Record<ViewId, { title: string; desc: string }> = {
    projects: { title: "Projects", desc: "Open, duplicate or import a project." },
    details: { title: "Project details", desc: "Who it is for and the names to arrange." },
    arrangement: { title: "Arrangement", desc: "A layout is generated from your names. Pick a different one if you like." },
    fonts: { title: "Fonts", desc: "Lettering for the family name, year and tiles." },
    frame: { title: "Frame", desc: "Size of the ring and the engraved base." },
    tiles: { title: "Tiles", desc: "Tile and letter size for the crossword." },
    export: { title: "Export", desc: "Laser files and a proof for the customer." },
  };

  const nextFooter = (id: StepId) => {
    const next = nextStep(id);
    if (!next) return null;
    const state = stepState(next);
    return (
      <div className="panel-footer">
        {!state.openable && state.blockedBy && (
          <span className="muted small">
            <span className="sr-only">Next is locked: </span>Finish {STEP_LABELS[state.blockedBy]} first.
          </span>
        )}
        <button type="button" className="next-button" disabled={!state.openable} onClick={() => goFromPanel(next)}>
          Next: {STEP_LABELS[next]} <ArrowIcon />
        </button>
      </div>
    );
  };

  const panel = (id: ViewId, body: ReactNode) => (
    <section className="panel" hidden={view !== id} aria-labelledby={`panel-${id}-heading`}>
      <header className="panel-header">
        <p className="eyebrow">{id === "projects" ? "Library" : `Step ${STEP_IDS.indexOf(id) + 1} of ${STEP_IDS.length}`}</p>
        <h2 id={`panel-${id}-heading`} tabIndex={-1}>
          {PANEL_TEXT[id].title}
        </h2>
        <p className="muted small">{PANEL_TEXT[id].desc}</p>
      </header>
      {body}
      {id !== "projects" && nextFooter(id)}
    </section>
  );

  const fitState = crossword.state !== "shown" ? "none" : crossword.outsideCount === 0 ? "fits" : "fails";

  return (
    <div className="app">
      <TopBar
        projectName={project.id === "" ? "New project" : project.projectName}
        status={status}
        saving={saving}
        saveDisabled={saveBlocked(project, hasErrors, saving)}
      />
      {errors.length > 0 && (
        <div className="banner error app-errors" role="alert">
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="workspace">
        <StepRail steps={steps} current={view} projectCount={projects.length} onPick={goTo} />

        <main className="stage" aria-label="Preview">
          <PreviewToolbar
            editButton={editButton}
            canCentre={!!layout && (layout.offset.xMm !== 0 || layout.offset.yMm !== 0)}
            onCentre={() =>
              setProject((p) => (p.selectedLayout ? { ...p, selectedLayout: centredLayout(p.selectedLayout) } : p))
            }
            position={offset ? `Position: x ${fmtMm(offset.xMm)} mm, y ${fmtMm(offset.yMm)} mm` : null}
            layers={layers}
            onToggleLayer={(key) => setLayers((l) => ({ ...l, [key]: !l[key] }))}
          />
          <p className="help-line muted small">
            {editEnds
              ? "Click + to add a tile; click a tile to choose its picture. Moving is off while editing end tiles."
              : crossword.state === "shown"
                ? "Drag the crossword to move it, or select it and use the arrow keys (Shift for 5 mm steps)."
                : ""}
          </p>
          {editMessage && (
            <p className="banner warn stage-banner" role="alert">
              {editMessage}
            </p>
          )}
          <div className="canvas">
            <div className="canvas-art">
              <FramePreview geometry={geometry} crossword={overlay} layers={layers} />
            </div>
            <div className="crossword-status">
              {(crossword.state === "none" || crossword.state === "stale") && (
                <p className={runState.problem || hasErrors ? "banner warn" : "stage-note"} role="status">
                  {previewNote}
                </p>
              )}
            </div>
            {selectedTile && (
              <div className="tile-editor-wrap">
                <TileEditor
                  title={`Tile ${selectedTile.anchor.end === "start" ? "before" : "after"} ${(project.names.find((n) => n.id === selectedTile.anchor.nameId)?.text ?? "").trim().toUpperCase()}`}
                  tile={selectedTile}
                  uploads={project.artwork}
                  busy={uploading}
                  message={uploadMessage}
                  warnings={uploadWarnings}
                  onPick={pickArtwork}
                  onUpload={(file) => void uploadArtwork(file)}
                  onRemoveTile={() => {
                    const id = selectedTile.id;
                    setSelectedTileId(null);
                    setProject((p) => ({
                      ...p,
                      selectedLayout: p.selectedLayout ? removeDecorativeTile(p.selectedLayout, id) : p.selectedLayout,
                    }));
                  }}
                  onDeleteArtwork={(id) => setProject((p) => removeArtwork(p, id))}
                  onClose={() => setSelectedTileId(null)}
                />
              </div>
            )}
          </div>
          {piece.error && (
            <p className="banner error stage-banner" role="alert">
              Could not build the crossword: {piece.error}
            </p>
          )}
          {crossword.state === "shown" && missingGlyphs.length > 0 && (
            <p className="banner warn stage-banner" role="alert">
              The tile font cannot draw {missingGlyphs.map((c) => `"${c}"`).join(", ")}. Choose another tile font or
              change the name.
            </p>
          )}
          {crossword.state === "shown" &&
            pieceErrors
              .filter((p) => p.code !== "missing-glyph")
              .map((p, i) => (
                <p key={i} className="banner warn stage-banner" role="alert">
                  {p.message}
                </p>
              ))}
          <SizeFitBar
            tileSize={`${fmtMm(tileSizeMm)} mm`}
            diameter={`${fmtMm(frame.outerDiameterMm)} mm`}
            crossword={
              crossword.state === "shown" && bounds
                ? `${fmtMm(bounds.maxX - bounds.minX)} × ${fmtMm(bounds.maxY - bounds.minY)} mm`
                : "—"
            }
            fit={
              crossword.state !== "shown"
                ? "—"
                : crossword.outsideCount === 0
                  ? "Fits inside the frame."
                  : `Does not fit: ${crossword.outsideCount} ${crossword.outsideCount === 1 ? "tile is" : "tiles are"} outside the allowed area.`
            }
            fitState={fitState}
            advice={
              fitState === "fails" && (
                <p className="banner warn" role="alert">
                  Reduce the tile size, increase the diameter, or move the crossword.
                </p>
              )
            }
          />
        </main>

        <aside className="control-panel" aria-label="Controls" ref={panelRef}>
          {panel(
            "projects",
            <ProjectList
              projects={projects}
              activeId={project.id}
              onNew={startNew}
              busy={busy}
              onOpen={(id) => void open(id)}
              onDuplicate={(p) => void duplicate(p)}
              onImport={(file) => void importFile(file)}
              onDelete={(p) => void remove(p)}
            />,
          )}
          {panel(
            "details",
            <>
              <ProjectEditor
                project={project}
                hasErrors={hasErrors}
                saving={saving}
                onChange={setProject}
                onSave={() => void save()}
              />
              <div className="divided">
                <div>
                  <button type="button" onClick={exportJson}>
                    Export project (JSON)
                  </button>
                </div>
                <p className="muted small">Saves a file you can back up or import on another computer.</p>
              </div>
            </>,
          )}
          {panel(
            "arrangement",
            <SolverPanel
              key={session}
              project={project}
              geometry={geometry}
              hasErrors={hasErrors}
              frameProblem={generateFrameNote}
              onRankChange={setRank}
              onRunState={setRunState}
              announce={announceFrom("arrangement")}
              onSolverChange={(solver) => setProject((p) => ({ ...p, settings: { ...p.settings, solver } }))}
              onSelect={(solved) => setProject((p) => ({ ...p, selectedLayout: solved.layout }))}
            />,
          )}
          {panel(
            "fonts",
            <>
              <FontPanel
                options={options}
                values={fontIds}
                library={library}
                libraryError={libraryError}
                onChange={setFontId}
                onLibraryChanged={refreshLibrary}
                onRemove={removeLibraryFont}
                confirm={confirm}
                cancelConfirm={cancelConfirm}
                announce={announceFrom("fonts")}
                samples={fontSamples}
                notes={fontNotes}
              />
              {!fonts && !fontError && <p className="muted">Loading fonts…</p>}
              {fontError && (
                <p className="banner error" role="alert">
                  {fontError}
                </p>
              )}
            </>,
          )}
          {panel(
            "frame",
            <>
              {framePart.error && (
                <p className="banner error" role="alert">
                  Could not build the frame: {framePart.error}
                </p>
              )}
              {framePart.frame && framePart.frame.warnings.length > 0 && (
                <ul className="banner warn">
                  {framePart.frame.warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              )}
              <FrameControls
                key={session}
                frame={frame}
                diameterSliderMin={minimumValidDiameter(frame)}
                onChange={(next) => setProject((p) => ({ ...p, settings: { ...p.settings, frame: next } }))}
                onFieldProblem={reportFieldProblem}
                diameterAction={
                  <>
                    <div>
                      <button type="button" className="small-button" disabled={!canResize || !fonts} onClick={smallestDiameter}>
                        Smallest that fits
                      </button>
                    </div>
                    {sizeNote("diameter")}
                  </>
                }
              />
            </>,
          )}
          {panel(
            "tiles",
            <>
              <div className="group">
                <div className="size-control">
                  <NumberField
                    key={session}
                    id="tileSize"
                    label="Tile size"
                    unit="mm"
                    value={tileSizeMm}
                    check={tileSizeProblem}
                    onValid={setTileSize}
                    onProblem={reportFieldProblem}
                  />
                  <input
                    type="range"
                    aria-label="Tile size slider (mm)"
                    min={TILE_SLIDER.min}
                    max={TILE_SLIDER.max}
                    step="0.1"
                    value={Math.min(TILE_SLIDER.max, Math.max(TILE_SLIDER.min, tileSizeMm))}
                    onChange={(e) => {
                      if (!tileSizeProblem(e.target.value)) setTileSize(Number(e.target.value));
                    }}
                  />
                </div>
                <div>
                  <button type="button" className="small-button" disabled={!canResize} onClick={largestTile}>
                    Largest that fits
                  </button>
                </div>
                {sizeNote("tile")}
              </div>
              <div className="group">
                <div className="size-control">
                  <NumberField
                    key={session}
                    id="letterSize"
                    label="Letter size"
                    unit="%"
                    unitName="% of tile"
                    value={Math.round((letterHeightRatio ?? DEFAULT_LETTER_HEIGHT_RATIO) * 1000) / 10}
                    check={letterPercentProblem}
                    onValid={(n) => setLettering({ letterHeightRatio: Math.round(n * 10) / 1000 })}
                    onProblem={reportFieldProblem}
                  />
                  <input
                    type="range"
                    aria-label="Letter size slider (% of tile)"
                    min={LETTER_PERCENT.min}
                    max={LETTER_PERCENT.max}
                    step="1"
                    value={Math.round((letterHeightRatio ?? DEFAULT_LETTER_HEIGHT_RATIO) * 100)}
                    onChange={(e) => setLettering({ letterHeightRatio: Number(e.target.value) / 100 })}
                  />
                </div>
              </div>
              <label className="check boxed">
                <input type="checkbox" checked={showScores} onChange={(e) => setLettering({ showScores: e.target.checked })} />{" "}
                Show point values
              </label>
              <div className="soft-box">
                <h3 className="box-title">End tiles</h3>
                <p className="muted small">Add a picture tile before or after a name.</p>
                <div>{editButton}</div>
              </div>
            </>,
          )}
          {panel(
            "export",
            <ExportPanel
              design={design}
              extraBlockers={fontBlockers}
              colours={exportSettings}
              projectName={project.projectName}
              confirmKey={confirmKey}
              onColoursChange={setExportSettings}
              onResetColours={() => setExportSettings(defaultExportSettings())}
              glyphMessages={glyphMessages}
              onGoToStep={goFromPanel}
              canOpenStep={canOpen}
              announce={announceFrom("export")}
            />,
          )}
        </aside>
      </div>
      {confirmDialog}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
}
