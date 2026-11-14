// Artwork limits and ids shared by the converter, the validator and the app (CHG-0007 AC8).

// Raw file size, checked by the app before parsing.
export const MAX_ARTWORK_FILE_BYTES = 200 * 1024;
export const MAX_CUSTOM_ARTWORK = 20;
export const MAX_ARTWORK_SHAPES = 500;
// Total path-data characters per picture; 20 pictures stay near 1.3 MB with JSON overhead, under the 2 MB request limit.
export const MAX_ARTWORK_PATH_CHARS = 50_000;
export const MAX_ARTWORK_NAME_LENGTH = 60;
export const MAX_ARTWORK_ID_LENGTH = 40;
// Input-tree caps so a hostile file cannot make the converter run long.
export const MAX_SVG_DEPTH = 32;
export const MAX_SVG_NODES = 5000;
// Path segments produced while converting one file, after arcs are expanded.
export const MAX_ARTWORK_SEGMENTS = 15_000;

// Stored pictures are rescaled so their larger side spans this many units, then rounded.
export const ARTWORK_BOX = 100;
export const ARTWORK_DECIMALS = 2;
// Largest coordinate accepted in stored path data and bounds.
export const MAX_ARTWORK_COORDINATE = 1_000_000;

// Picture margin on every side, as a fraction of the tile size (AC9).
export const ARTWORK_MARGIN_RATIO = 0.15;

export const BUILTIN_PREFIX = "builtin:";
export const BUILTIN_ARTWORK_IDS = [
  "builtin:heart",
  "builtin:star",
  "builtin:paw",
  "builtin:spade",
  "builtin:cat",
  "builtin:cow",
] as const;
export type BuiltinArtworkId = (typeof BUILTIN_ARTWORK_IDS)[number];
export const DEFAULT_ARTWORK_ID: BuiltinArtworkId = "builtin:heart";

export function isBuiltinArtworkId(id: unknown): id is BuiltinArtworkId {
  return typeof id === "string" && (BUILTIN_ARTWORK_IDS as readonly string[]).includes(id);
}
