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
  artworkId: string | null;
  source: "automatic" | "manual";
  purpose: "connector" | "decoration";
  // The name end this tile extends.
  anchor: { nameId: string; end: "start" | "end" };
  // Connectors only: the one other name this tile joins.
  joinsNameId?: string;
}

export interface ArtworkAsset {
  id: string;
  name: string;
  source: "builtin" | "custom";
  svg?: string;
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
}

export interface DesignSettings {
  tileSizeMm: number;
  frame: FrameSettings;
  lettering: LetteringSettings;
  solver: SolverSettings;
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
