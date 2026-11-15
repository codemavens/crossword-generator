// Step order, completion, unlocking and rail summaries for the workspace (CHG-0009 AC5–AC11).
// Pure: it reads facts App already computes and never validates anything itself.
import type { ExportBlockerCode } from "../core/design/buildDesign.ts";

export const STEP_IDS = ["details", "arrangement", "fonts", "frame", "tiles", "export"] as const;
export type StepId = (typeof STEP_IDS)[number];
export type ViewId = "projects" | StepId;

export const STEP_LABELS: Record<StepId, string> = {
  details: "Details",
  arrangement: "Arrangement",
  fonts: "Fonts",
  frame: "Frame",
  tiles: "Tiles",
  export: "Export",
};

export interface StepFacts {
  projectName: string;
  nameCount: number;
  // Any name fails validateNameText.
  namesInvalid: boolean;
  arrangementChosen: boolean;
  // The chosen arrangement no longer matches the names (layout errors).
  arrangementStale: boolean;
  // Position of the chosen arrangement in the generated list, when it is in it.
  arrangementRank: { index: number; count: number } | null;
  fontsLoading: boolean;
  // The fonts could not be loaded at all (no frame can be built).
  fontsFailed: boolean;
  missingFontCount: number;
  fontNames: string[];
  // A frame number field shows a problem, or a saved frame value breaks a rule.
  frameFieldProblem: boolean;
  frameBuilt: boolean;
  outerDiameterMm: number;
  tileSizeValid: boolean;
  letterSizeValid: boolean;
  tileSizeMm: number;
  // Nothing blocks export.
  exportReady: boolean;
}

export interface StepState {
  id: StepId;
  number: number;
  label: string;
  summary: string;
  complete: boolean;
  // Every earlier step is complete (or the AC8a font exception applies).
  unlocked: boolean;
  // Unlocked, or the step being viewed, or earlier than it.
  openable: boolean;
  // First earlier step that is not complete, for a locked step.
  blockedBy: StepId | null;
  // Not complete while a later step is being viewed.
  attention: boolean;
}

const fmtMm = (n: number) => String(Math.round(n * 10) / 10);

export function stepCompletion(f: StepFacts): Record<StepId, boolean> {
  return {
    details: f.projectName.trim() !== "" && f.nameCount > 0 && !f.namesInvalid,
    arrangement: f.arrangementChosen && !f.arrangementStale,
    fonts: !f.fontsLoading && !f.fontsFailed && f.missingFontCount === 0,
    frame: !f.frameFieldProblem && f.frameBuilt,
    tiles: f.tileSizeValid && f.letterSizeValid,
    export: f.exportReady,
  };
}

export function stepSummary(id: StepId, f: StepFacts): string {
  switch (id) {
    case "details":
      return `${f.nameCount} ${f.nameCount === 1 ? "name" : "names"}`;
    case "arrangement":
      if (!f.arrangementChosen) return "None chosen";
      if (f.arrangementStale) return "No longer matches the names";
      return f.arrangementRank ? `#${f.arrangementRank.index + 1} of ${f.arrangementRank.count} chosen` : "Chosen";
    case "fonts":
      return [...new Set(f.fontNames)].join(" · ");
    case "frame":
      return `${fmtMm(f.outerDiameterMm)} mm`;
    case "tiles":
      return `${fmtMm(f.tileSizeMm)} mm`;
    case "export":
      return f.exportReady ? "Ready" : "Not ready";
  }
}

export function stepStates(f: StepFacts, current: ViewId): StepState[] {
  const complete = stepCompletion(f);
  const currentIndex = current === "projects" ? -1 : STEP_IDS.indexOf(current);
  return STEP_IDS.map((id, i) => {
    const firstIncomplete = STEP_IDS.slice(0, i).find((s) => !complete[s]) ?? null;
    // AC8a: Generate needs the frame and the frame needs the fonts, so a font failure must not lock Fonts away.
    const fontEscape = id === "fonts" && complete.details && f.fontsFailed && !complete.arrangement;
    const unlocked = firstIncomplete === null || fontEscape;
    return {
      id,
      number: i + 1,
      label: STEP_LABELS[id],
      summary: stepSummary(id, f),
      complete: complete[id],
      unlocked,
      openable: unlocked || i <= currentIndex,
      blockedBy: unlocked ? null : firstIncomplete,
      attention: !complete[id] && id !== "export" && i < currentIndex,
    };
  });
}

export function nextStep(id: StepId): StepId | null {
  return STEP_IDS[STEP_IDS.indexOf(id) + 1] ?? null;
}

// Which step fixes an export blocker; a tile-font glyph problem is fixed by choosing another font.
export function blockerStep(code: ExportBlockerCode | "fonts" | "files", glyphProblem = false): StepId {
  switch (code) {
    case "fonts":
      return "fonts";
    case "frame-failed":
    case "frame-unusable":
      return "frame";
    case "no-layout":
    case "layout-invalid":
      return "arrangement";
    case "crossword-problem":
      return glyphProblem ? "fonts" : "tiles";
    case "crossword-failed":
      return "tiles";
    case "files":
      return "export";
  }
}
