// Solver data types. Everything here is plain data so results can cross a Web Worker boundary.
import type { Point } from "../geometry/types.ts";
import type { CrosswordLayout, GridPosition, NameEntry, SolverSettings, SolverWeights } from "../models/project.ts";

// Usable opening in tile units (mm / tileSizeMm), frame centre at the origin, y down.
// An empty polygon means the frame has no opening: nothing fits.
export interface SolverOpening {
  polygon: Point[];
  centroid: Point;
  // Minimum gap to the opening's edge, in tile units.
  clearance: number;
  // Needed to convert a layout's mm offset into tile units.
  tileSizeMm: number;
}

export interface SolveInput {
  names: NameEntry[];
  settings: SolverSettings;
  // Omitted: no fit information (fit is null, circularFit scores 0).
  opening?: SolverOpening;
}

export type LayoutIssueCode =
  | "unknown-name"
  | "missing-name"
  | "duplicate-placement"
  | "name-too-short"
  | "invalid-name-text"
  | "invalid-placement"
  | "conflicting-characters"
  | "parallel-overlap"
  | "contained-name"
  | "side-by-side"
  | "end-not-clear"
  | "disconnected"
  | "decorative-tiles-not-supported"
  | "exceeds-opening";

export interface LayoutIssue {
  code: LayoutIssueCode;
  // Structural problems are errors; fit problems are warnings (SPEC §9.2, §19).
  severity: "error" | "warning";
  message: string;
  nameIds: string[];
  positions: GridPosition[];
}

// Inclusive grid-cell bounds; width and height count cells.
export interface LayoutBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface FitResult {
  fits: boolean;
  // Grid squares (layout coordinates) not wholly inside the opening shrunk by the clearance.
  tilesOutside: GridPosition[];
  tileCount: number;
}

export type ScoreBreakdown = Record<keyof SolverWeights, number>;

export interface SolvedLayout {
  layout: CrosswordLayout;
  bounds: LayoutBounds;
  tileCount: number;
  intersectionCount: number;
  connectorCount: number;
  score: { total: number; breakdown: ScoreBreakdown };
  // Null when no opening was supplied.
  fit: FitResult | null;
  issues: LayoutIssue[];
}

export interface NameProblem {
  nameId: string;
  message: string;
}

export type SolveFailure =
  | { code: "no-names"; message: string }
  | { code: "too-many-names"; message: string }
  | { code: "invalid-names"; message: string }
  // groups: name ids of each set of names that share characters only among themselves.
  | { code: "no-shared-letters"; message: string; groups: string[][] }
  | { code: "no-arrangement-found"; message: string };

export interface SolveStats {
  restarts: number;
  nodesEvaluated: number;
  completeLayoutsFound: number;
  distinctLayoutsFound: number;
}

export interface SolveResult {
  seed: number;
  // Best first; empty when failure is set.
  layouts: SolvedLayout[];
  failure?: SolveFailure;
  nameProblems: NameProblem[];
  stats: SolveStats;
}
