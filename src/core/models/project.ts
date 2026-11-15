// Shared data model (docs/SPEC.md §15). Physical lengths are millimetres.

export type Direction = "horizontal" | "vertical";

export interface GridPosition {
  x: number;
  y: number;
}

export interface NameEntry {
  id: string;
  text: string;
}

export interface NamePlacement {
  nameId: string;
  start: GridPosition;
  direction: Direction;
}

export interface DecorativeTile {
  id: string;
  position: GridPosition;
  // null = blank, "builtin:<name>", or the id of an entry in project.artwork.
  artworkId: string | null;
  source: "automatic" | "manual";
  purpose: "connector" | "decoration";
  // The name end this tile extends.
  anchor: { nameId: string; end: "start" | "end" };
  // Connectors only: the one other name this tile joins.
  joinsNameId?: string;
}

// One filled outline. `d` is normalised path data: absolute M/L/C/Z only, transforms applied (CHG-0007).
export interface ArtworkShape {
  d: string;
  fillRule: "nonzero" | "evenodd";
}

export interface ArtworkBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Application-owned plain shape data; never raw SVG. `project.artwork` holds custom uploads only.
export interface ArtworkAsset {
  id: string;
  name: string;
  source: "builtin" | "custom";
  shapes: ArtworkShape[];
  bounds: ArtworkBounds;
}

export interface SolverWeights {
  circularFit: number;
  compactness: number;
  visualBalance: number;
  naturalIntersections: number;
  fewConnectors: number;
}

export type SearchMode = "quick" | "balanced" | "thorough";

export interface SolverSettings {
  seed: number;
  searchMode: SearchMode;
  weights: SolverWeights;
}

export interface CrosswordLayout {
  id: string;
  seed: number;
  placements: NamePlacement[];
  // Automatic connectors and manual decorations (SPEC §15, renamed from `connectors`).
  decorativeTiles: DecorativeTile[];
  // Moves the whole crossword as one group; grid coordinates stay untouched.
  offset: { xMm: number; yMm: number };
}

export interface FrameSettings {
  outerDiameterMm: number;
  ringWidthMm: number;
  familyNameFontId: string;
  familyNameFontSizeMm: number;
  yearFontId?: string;
  yearFontSizeMm?: number;
  nameBufferMm: number;
  // 0 = outline close to the lettering, 1 = loose band.
  contourSmoothness: number;
  // Height of the solid area's top edge above the lowest point of the inner circle.
  bottomLineHeightMm: number;
  // How far the family name's baseline sits below the bottom line.
  nameDropMm: number;
  // Rounding where the bottom line meets the inner circle; 0 = sharp corner.
  bottomCornerRadiusMm: number;
  // Minimum gap between the crossword and the frame's inner cut.
  crosswordClearanceMm: number;
}

export interface LetteringSettings {
  tileFontId: string;
  showScores: boolean;
  // Cap height as a fraction of the tile size.
  letterHeightRatio: number;
}

// Operation colours ("#RRGGBB", maps to OperationColours cut/score/engrave) and backer mark inset for the exported files.
export interface ExportSettings {
  cutColour: string;
  scoreColour: string;
  engraveColour: string;
  // How far the backer placement mark sits inside the crossword cut line, in mm.
  backerMarkInsetMm: number;
}

export interface DesignSettings {
  tileSizeMm: number;
  frame: FrameSettings;
  lettering: LetteringSettings;
  solver: SolverSettings;
  export: ExportSettings;
}

export interface NameArtProject {
  id: string;
  schemaVersion: number;
  projectName: string;
  customerName?: string;
  familyName: string;
  year?: string;
  names: NameEntry[];
  artwork: ArtworkAsset[];
  settings: DesignSettings;
  selectedLayout?: CrosswordLayout;
}
