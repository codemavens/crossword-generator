// One path from a project to its three pieces, shared by the preview, the export and the tests (CHG-0008 Stage C).
import type { ArtworkAsset, CrosswordLayout, ExportSettings, NameArtProject, NameEntry } from "../models/project.ts";
import { buildFrameGeometry } from "../geometry/frame.ts";
import { buildCrosswordGeometry } from "../geometry/crossword.ts";
import type { CrosswordGeometry } from "../geometry/crossword.ts";
import type { FontOutliner, FrameGeometry, FrameWarningCode, Point } from "../geometry/types.ts";
import { checkFit, gridOriginMm, openingForSolver, validateLayout } from "../solver/index.ts";
import type { FitResult, LayoutIssue, SolverOpening } from "../solver/index.ts";
import { exportBackerSvg, exportCrosswordSvg, exportFrameSvg, resolveColours } from "../export/svgExport.ts";
import type { ExportedFile, OperationColours } from "../export/svgExport.ts";

export interface DesignFonts {
  name: FontOutliner;
  year: FontOutliner;
  tile: FontOutliner;
}

export type ExportBlockerCode =
  | "no-layout"
  | "layout-invalid"
  | "frame-failed"
  | "frame-unusable"
  | "crossword-failed"
  | "crossword-problem";

// Machine-readable reason export must not be offered; `message` is plain language for the screen.
export interface ExportBlocker {
  code: ExportBlockerCode;
  message: string;
}

export interface Design {
  frame: FrameGeometry | null;
  frameError: string;
  crossword: CrosswordGeometry | null;
  crosswordError: string;
  // Top-left of grid square (0, 0) in frame mm, for the saved offset.
  originMm: Point | null;
  layoutIssues: LayoutIssue[];
  opening: SolverOpening | null;
  fit: FitResult | null;
  exportBlockers: ExportBlocker[];
  needsFitConfirmation: boolean;
}

// Frame warnings that leave the frame unusable; the others (name-too-wide, name-outside-frame,
// year-does-not-fit, setting-adjusted) still give a cuttable frame and are shown as warnings only.
export const BLOCKING_FRAME_WARNINGS: ReadonlySet<FrameWarningCode> = new Set<FrameWarningCode>(["no-opening", "missing-glyph"]);

export interface FramePart {
  frame: FrameGeometry | null;
  error: string;
}

export function buildFramePart(
  project: Pick<NameArtProject, "familyName" | "year"> & { settings: Pick<NameArtProject["settings"], "frame"> },
  fonts: Pick<DesignFonts, "name" | "year">,
): FramePart {
  try {
    const frame = buildFrameGeometry({
      familyName: project.familyName,
      year: project.year,
      settings: project.settings.frame,
      nameFont: fonts.name,
      yearFont: fonts.year,
    });
    return { frame, error: "" };
  } catch (err) {
    return { frame: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export function layoutIssuesFor(names: NameEntry[], layout: CrosswordLayout | undefined): LayoutIssue[] {
  return layout ? validateLayout(names, layout) : [];
}

export const hasLayoutErrors = (issues: readonly LayoutIssue[]): boolean => issues.some((i) => i.severity === "error");

export interface CrosswordPartInput {
  names: NameEntry[];
  layout: CrosswordLayout | undefined;
  layoutIssues: readonly LayoutIssue[];
  artwork: ArtworkAsset[];
  tileSizeMm: number;
  showScores: boolean;
  letterHeightRatio: number | undefined;
  // Centroid of the frame's usable opening.
  centroidMm: Point;
  tileFont: FontOutliner;
}

export interface CrosswordPart {
  crossword: CrosswordGeometry | null;
  originMm: Point | null;
  error: string;
}

// Built for the layout's saved offset; nothing is built without a structurally valid layout.
export function buildCrosswordPart(input: CrosswordPartInput): CrosswordPart {
  const { layout } = input;
  if (!layout || hasLayoutErrors(input.layoutIssues)) return { crossword: null, originMm: null, error: "" };
  try {
    const originMm = gridOriginMm(layout, input.names, input.centroidMm, input.tileSizeMm);
    const crossword = buildCrosswordGeometry({
      names: input.names,
      layout,
      tileSizeMm: input.tileSizeMm,
      originMm,
      tileFont: input.tileFont,
      showScores: input.showScores,
      artwork: input.artwork,
      letterHeightRatio: input.letterHeightRatio,
    });
    return { crossword, originMm, error: "" };
  } catch (err) {
    return { crossword: null, originMm: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export function designOpening(frame: FrameGeometry, tileSizeMm: number, clearanceMm: number): SolverOpening {
  return openingForSolver(frame.usableOpening, tileSizeMm, clearanceMm);
}

export interface DesignParts {
  layout: CrosswordLayout | undefined;
  framePart: FramePart;
  layoutIssues: LayoutIssue[];
  crosswordPart: CrosswordPart;
  opening: SolverOpening | null;
  // Fit of the layout at its saved offset.
  fit: FitResult | null;
}

export function exportBlockersFor(parts: DesignParts): ExportBlocker[] {
  const blockers: ExportBlocker[] = [];
  const { framePart, crosswordPart } = parts;
  if (framePart.error) blockers.push({ code: "frame-failed", message: `The frame could not be built: ${framePart.error}` });
  for (const w of framePart.frame?.warnings ?? []) {
    if (BLOCKING_FRAME_WARNINGS.has(w.code)) blockers.push({ code: "frame-unusable", message: w.message });
  }
  if (!parts.layout) {
    blockers.push({ code: "no-layout", message: "No crossword arrangement is chosen. Generate and pick one." });
    return blockers;
  }
  const errors = parts.layoutIssues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    blockers.push({
      code: "layout-invalid",
      message: "The names changed, so the chosen crossword no longer matches them. Generate again and pick an arrangement.",
    });
    return blockers;
  }
  if (crosswordPart.error) {
    blockers.push({ code: "crossword-failed", message: `The crossword could not be built: ${crosswordPart.error}` });
  }
  for (const p of crosswordPart.crossword?.problems ?? []) {
    if (p.severity === "error") blockers.push({ code: "crossword-problem", message: p.message });
  }
  // A missing crossword with no other reported reason still blocks.
  if (!crosswordPart.crossword && !crosswordPart.error && framePart.frame) {
    blockers.push({ code: "crossword-failed", message: "The crossword could not be built." });
  }
  return blockers;
}

export function assembleDesign(parts: DesignParts): Design {
  return {
    frame: parts.framePart.frame,
    frameError: parts.framePart.error,
    crossword: parts.crosswordPart.crossword,
    crosswordError: parts.crosswordPart.error,
    originMm: parts.crosswordPart.originMm,
    layoutIssues: parts.layoutIssues,
    opening: parts.opening,
    fit: parts.fit,
    exportBlockers: exportBlockersFor(parts),
    needsFitConfirmation: parts.fit !== null && !parts.fit.fits,
  };
}

export interface DesignInput {
  project: NameArtProject;
  fonts: DesignFonts;
}

export function buildDesign({ project, fonts }: DesignInput): Design {
  const layout = project.selectedLayout;
  const { tileSizeMm, frame: frameSettings, lettering } = project.settings;
  const framePart = buildFramePart(project, fonts);
  const layoutIssues = layoutIssuesFor(project.names, layout);
  const frame = framePart.frame;
  const crosswordPart: CrosswordPart = frame
    ? buildCrosswordPart({
        names: project.names,
        layout,
        layoutIssues,
        artwork: project.artwork,
        tileSizeMm,
        showScores: lettering?.showScores ?? true,
        letterHeightRatio: lettering?.letterHeightRatio,
        centroidMm: frame.usableOpening.centroid,
        tileFont: fonts.tile,
      })
    : { crossword: null, originMm: null, error: "" };
  const opening = frame ? designOpening(frame, tileSizeMm, frameSettings.crosswordClearanceMm) : null;
  const fit = opening && layout && crosswordPart.crossword ? checkFit(layout, project.names, opening) : null;
  return assembleDesign({ layout, framePart, layoutIssues, crosswordPart, opening, fit });
}

export function operationColours(settings: Partial<ExportSettings> | undefined): OperationColours {
  return resolveColours({ cut: settings?.cutColour, score: settings?.scoreColour, engrave: settings?.engraveColour });
}

export type ExportDesignResult = { ok: true; files: ExportedFile[] } | { ok: false; blockers: ExportBlocker[] };

// The three files in the order crossword, frame, backer; refuses while any blocker remains.
export function exportDesign(design: Design, colours: Partial<OperationColours>): ExportDesignResult {
  if (design.exportBlockers.length > 0) return { ok: false, blockers: design.exportBlockers };
  if (!design.frame || !design.crossword) {
    return { ok: false, blockers: [{ code: "crossword-failed", message: "The design is not complete." }] };
  }
  const c = resolveColours(colours);
  return {
    ok: true,
    files: [exportCrosswordSvg(design.crossword, c), exportFrameSvg(design.frame, c), exportBackerSvg(design.frame, c)],
  };
}
