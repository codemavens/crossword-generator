import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { FrameControls, NumberField } from "./components/FrameControls.tsx";
import { FramePreview } from "./components/FramePreview.tsx";
import { ExportPanel } from "./components/ExportPanel.tsx";
import type { CrosswordOverlay, OverlayDrag, OverlaySpot } from "./components/FramePreview.tsx";
import { ProjectEditor } from "./components/ProjectEditor.tsx";
import { ProjectList } from "./components/ProjectList.tsx";
import { TileEditor } from "./components/TileEditor.tsx";
import { SolverPanel } from "./components/SolverPanel.tsx";

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

  const open = async (id: string) => {
    setErrors([]);
    setStatus("");
    try {
      const loaded = withCurrentDefaults((await api.getProject(id)).project);
      setProject(loaded);
      setSession((n) => n + 1);
    } catch (err) {
      setErrors(describe(err));
    }
  };

  const startNew = () => {
    setErrors([]);
    setStatus("");
    setProject(newProject());
    setSession((n) => n + 1);
  };

  const remove = async (p: ProjectSummary) => {
    if (!window.confirm(`Delete project "${p.projectName}"? This cannot be undone.`)) return;
    setErrors([]);
    try {
      await api.deleteProject(p.id);
      if (project.id === p.id) {
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

  return (
    <div className="app">
      <header>
        <h1>Sloth &amp; Llama Name Art Designer</h1>
      </header>
      <div className="columns">
        <aside>
          <ProjectList
            projects={projects}
            activeId={project.id}
            onNew={startNew}
            onOpen={(id) => void open(id)}
            onDelete={(p) => void remove(p)}
          />
        </aside>
        <main>
          {errors.length > 0 && (
            <div className="banner error" role="alert">
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {status && <p className="banner ok" role="status">{status}</p>}
          <section className="panel" aria-labelledby="project-heading">
            <h2 id="project-heading">{project.id === "" ? "New project" : "Project"}</h2>
            <ProjectEditor
              project={project}
              hasErrors={hasErrors}
              saving={saving}
              onChange={setProject}
              onSave={() => void save()}
            />
          </section>

          <section className="panel" aria-labelledby="fonts-heading">
            <h2 id="fonts-heading">Fonts</h2>
            <FontPanel
              options={options}
              values={fontIds}
              library={library}
              libraryError={libraryError}
              onChange={setFontId}
              onLibraryChanged={refreshLibrary}
              onRemove={removeLibraryFont}
            />
            {current?.missing &&
              (["name", "year", "tile"] as const)
                .filter((k) => current.missing[k] !== null)
                .map((k) => (
                  <p key={k} className="banner warn" role="alert">
                    {FONT_SETTING_LABELS[k]}: the chosen font is not available. {current.missing[k]} The preview uses{" "}
                    {fontLabel(DEFAULT_FONT_FOR[k])} instead. Choose a font before exporting.
                  </p>
                ))}
            {!fonts && !fontError && <p className="muted">Loading fonts…</p>}
            {fontError && (
              <p className="banner error" role="alert">
                {fontError}
              </p>
            )}
          </section>

          <section className="panel" aria-labelledby="frame-heading">
            <h2 id="frame-heading">Frame</h2>
            <FrameControls
              frame={frame}
              diameterSliderMin={minimumValidDiameter(frame)}
              onChange={(next) => setProject((p) => ({ ...p, settings: { ...p.settings, frame: next } }))}
              diameterAction={
                <button type="button" disabled={!canResize || !fonts} onClick={smallestDiameter}>
                  Smallest that fits
                </button>
              }
            />
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
          </section>

          <section className="panel" aria-labelledby="crossword-heading">
            <h2 id="crossword-heading">Crossword</h2>
            <div className="size-control">
              <NumberField id="tileSize" label="Tile size (mm)" value={tileSizeMm} check={tileSizeProblem} onValid={setTileSize} />
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
              <button type="button" disabled={!canResize} onClick={largestTile}>
                Largest that fits
              </button>
            </div>
            <div className="size-control">
              <NumberField
                id="letterSize"
                label="Letter size (% of tile)"
                value={Math.round((letterHeightRatio ?? DEFAULT_LETTER_HEIGHT_RATIO) * 1000) / 10}
                check={letterPercentProblem}
                onValid={(n) => setLettering({ letterHeightRatio: Math.round(n * 10) / 1000 })}
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
            <label className="check">
              <input type="checkbox" checked={showScores} onChange={(e) => setLettering({ showScores: e.target.checked })} />{" "}
              Show point values
            </label>
            {sizeMessage && (
              <p className="banner warn" role="status">
                {sizeMessage}
              </p>
            )}
          </section>

          <section className="panel preview-section" aria-labelledby="preview-heading">
            <h2 id="preview-heading">Preview</h2>
            <div className="row wrap">
              <button
                type="button"
                aria-pressed={editEnds}
                disabled={crossword.state !== "shown"}
                onClick={() => {
                  setEditEnds(!editEnds);
                  setEditMessage("");
                }}
              >
                {editEnds ? "Done editing end tiles" : "Edit end tiles"}
              </button>
              <button
                type="button"
                disabled={!layout || (layout.offset.xMm === 0 && layout.offset.yMm === 0)}
                onClick={() =>
                  setProject((p) => (p.selectedLayout ? { ...p, selectedLayout: centredLayout(p.selectedLayout) } : p))
                }
              >
                Centre
              </button>
              {offset && (
                <span className="muted small" aria-live="polite">
                  Position: x {fmtMm(offset.xMm)} mm, y {fmtMm(offset.yMm)} mm
                </span>
              )}
            </div>
            <p className="muted small">
              {editEnds
                ? "Click + to add a tile; click a tile to choose its picture. Moving is off while editing end tiles."
                : crossword.state === "shown"
                  ? "Drag the crossword to move it, or select it and use the arrow keys (Shift for 5 mm steps)."
                  : ""}
            </p>
            {editMessage && (
              <p className="banner warn" role="alert">
                {editMessage}
              </p>
            )}
            <FramePreview geometry={geometry} crossword={overlay} />
            {piece.error && (
              <p className="banner error" role="alert">
                Could not build the crossword: {piece.error}
              </p>
            )}
            {crossword.state === "shown" && missingGlyphs.length > 0 && (
              <p className="banner warn" role="alert">
                The tile font cannot draw {missingGlyphs.map((c) => `"${c}"`).join(", ")}. Choose another tile font or
                change the name.
              </p>
            )}
            {crossword.state === "shown" &&
              pieceErrors
                .filter((p) => p.code !== "missing-glyph")
                .map((p, i) => (
                  <p key={i} className="banner warn" role="alert">
                    {p.message}
                  </p>
                ))}
            {selectedTile && (
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
            )}
            <div className="crossword-status">
              {crossword.state === "none" && <p className="muted">Generate to see arrangements.</p>}
              {crossword.state === "stale" && (
                <p className="banner warn" role="status">
                  The names changed, so the saved crossword no longer matches. Generate again and pick an arrangement.
                </p>
              )}
            </div>
            <div className="size-fit" aria-labelledby="size-fit-heading">
              <h3 id="size-fit-heading">Size and fit</h3>
              <dl>
                <dt>Tile size</dt>
                <dd>{fmtMm(tileSizeMm)} mm</dd>
                <dt>Frame diameter</dt>
                <dd>{fmtMm(frame.outerDiameterMm)} mm</dd>
                <dt>Crossword</dt>
                <dd>
                  {crossword.state === "shown" && bounds
                    ? `${fmtMm(bounds.maxX - bounds.minX)} × ${fmtMm(bounds.maxY - bounds.minY)} mm`
                    : "—"}
                </dd>
                <dt>Fit</dt>
                <dd>
                  {crossword.state !== "shown"
                    ? "—"
                    : crossword.outsideCount === 0
                      ? "Fits inside the frame."
                      : `Does not fit: ${crossword.outsideCount} ${crossword.outsideCount === 1 ? "tile is" : "tiles are"} outside the allowed area.`}
                </dd>
              </dl>
              {crossword.state === "shown" && crossword.outsideCount > 0 && (
                <p className="banner warn" role="alert">
                  Reduce the tile size, increase the diameter, or move the crossword.
                </p>
              )}
            </div>
          </section>

          <section className="panel" aria-labelledby="export-heading">
            <h2 id="export-heading">Export</h2>
            <ExportPanel
              design={design}
              extraBlockers={fontBlockers}
              colours={exportSettings}
              projectName={project.projectName}
              confirmKey={confirmKey}
              onColoursChange={setExportSettings}
              onResetColours={() => setExportSettings(defaultExportSettings())}
            />
          </section>

          <section className="panel" aria-label="Arrangement">
            <SolverPanel
              key={session}
              project={project}
              geometry={geometry}
              hasErrors={hasErrors}
              onSolverChange={(solver) =>
                setProject((p) => ({ ...p, settings: { ...p.settings, solver } }))
              }
              onSelect={(solved) => setProject((p) => ({ ...p, selectedLayout: solved.layout }))}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
