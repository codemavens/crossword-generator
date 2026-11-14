// Shared geometry types. Units are millimetres, origin at the frame centre,
// x to the right and y DOWN (same as SVG).

export interface Point {
  x: number;
  y: number;
}

// A closed polygon; the last point is not repeated.
export type Ring = Point[];

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Flattened text outlines with the baseline start at (0, 0), y down.
// Fill rule is non-zero; counters (holes in letters) are separate rings.
export interface TextOutline {
  rings: Ring[];
  bounds: Bounds;
  advanceMm: number;
}

// Application-owned view of a font; the font library stays behind this.
export interface FontOutliner {
  readonly id: string;
  // sizeMm is the em size. Throws if the font has no glyph for a character.
  outline(text: string, sizeMm: number): TextOutline;
  hasGlyphs(text: string): boolean;
}

export type FrameWarningCode =
  | "name-too-wide"
  | "name-outside-frame"
  | "year-does-not-fit"
  | "missing-glyph"
  | "no-opening"
  | "setting-adjusted";

export interface FrameWarning {
  code: FrameWarningCode;
  message: string;
}

export interface FrameGeometry {
  // Exact circle; never approximated by a polygon.
  outer: Circle;
  // The single inner cut path of the frame layer; empty with a "no-opening" warning.
  innerCut: Ring;
  // Filled outlines to engrave, already positioned.
  engraving: { name: Ring[]; year: Ring[] };
  backer: Circle;
  // Open area inside the inner cut, for placing and fit-checking the crossword.
  usableOpening: { polygon: Ring; centroid: Point; areaMm2: number };
  warnings: FrameWarning[];
}
