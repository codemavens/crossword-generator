// Piece 1 (SPEC §2.1): cut outline, score lines and engraving of the crossword, in frame-space millimetres (y down).
import type { ArtworkAsset, CrosswordLayout, GridPosition, NameEntry } from "../models/project.ts";
import { resolveArtwork } from "../artwork/builtin.ts";
import { artworkTransform } from "../artwork/placement.ts";
import { flattenSegments, parsePathData } from "../artwork/pathData.ts";
import { normalizeNames } from "../solver/normalize.ts";
import { occupiedCells, TILE_CHAR } from "../solver/grid.ts";
import { componentCount, internalEdges, traceOutline } from "./gridOutline.ts";
import { letterValue } from "./letterValues.ts";
import { ringsBounds } from "./ringMath.ts";
import type { Bounds, FontOutliner, Point, Ring } from "./types.ts";

export const DEFAULT_LETTER_HEIGHT_RATIO = 0.55;
// Point value digit height and its inset from the tile's right and bottom edges, as fractions of the tile.
export const SCORE_HEIGHT_RATIO = 0.2;
export const SCORE_INSET_RATIO = 0.08;
// Engraving never comes closer than this to a tile edge.
export const TILE_ENGRAVING_MARGIN_RATIO = 0.05;
// Curve flattening tolerance for artwork, in millimetres after scaling.
const ARTWORK_TOLERANCE_MM = 0.02;
// Reference glyphs measured once for the cap height and the digit height.
const CAP_REFERENCE = "H";
const DIGIT_REFERENCE = "0";

export interface Segment {
  a: Point;
  b: Point;
}

export interface EngravingShape {
  rings: Ring[];
  fillRule: "nonzero" | "evenodd";
}

export type CrosswordTileKind = "letter" | "punctuation" | "decorative";

export interface CrosswordTile {
  // Grid square; may be negative.
  x: number;
  y: number;
  kind: CrosswordTileKind;
  // Normalised character, or null for a decorative tile.
  char: string | null;
  // Decorative tile id, or null for a name character.
  tileId: string | null;
  // Top-left corner in mm; the square is tileSizeMm wide.
  rect: { x: number; y: number; size: number };
  // Filled outlines (non-zero) for the character and its point value.
  letter: Ring[];
  score: Ring[];
  // Picture outlines with each shape's own fill rule.
  artwork: EngravingShape[];
}

export type CrosswordProblemCode = "missing-glyph" | "disconnected" | "glyph-shrunk" | "artwork-unreadable" | "empty";

export interface CrosswordProblem {
  code: CrosswordProblemCode;
  // Errors block export; warnings are information.
  severity: "error" | "warning";
  message: string;
  char?: string;
  positions: GridPosition[];
}

export interface CrosswordGeometry {
  tileSizeMm: number;
  // Outer ring is clockwise on screen (positive signed area, y down); holes run the other way.
  cut: { outer: Ring; holes: Ring[] };
  // Each shared tile edge exactly once, merged into straight runs.
  score: Segment[];
  // Flat lists per engraving kind; the same rings as in `tiles`.
  engraving: { letters: Ring[]; scores: Ring[]; artwork: EngravingShape[] };
  tiles: CrosswordTile[];
  bounds: Bounds;
  problems: CrosswordProblem[];
}

export interface CrosswordInput {
  names: NameEntry[];
  layout: CrosswordLayout;
  tileSizeMm: number;
  // Top-left of grid square (0, 0), from gridOriginMm.
  originMm: Point;
  tileFont: FontOutliner;
  showScores: boolean;
  // project.artwork (custom uploads); built-ins are resolved by id.
  artwork: ArtworkAsset[];
  // Cap height as a fraction of the tile size.
  letterHeightRatio?: number;
}

function placeRings(rings: Ring[], scale: number, dx: number, dy: number): Ring[] {
  return rings.map((r) => r.map((p) => ({ x: p.x * scale + dx, y: p.y * scale + dy })));
}

interface GlyphMetrics {
  // Height above the baseline of the reference glyph at an em size of 1.
  capPerEm: number;
  digitPerEm: number;
}

function measure(font: FontOutliner, ref: string): number {
  if (!font.hasGlyphs(ref)) return 0;
  const b = font.outline(ref, 1).bounds;
  return Math.max(0, -b.minY);
}

// Character outlines sharing one baseline, centred horizontally; shrunk about the baseline only if they would leave the tile's margin.
function letterRings(
  font: FontOutliner,
  char: string,
  t: number,
  ratio: number,
  metrics: GlyphMetrics,
): { rings: Ring[]; shrunk: boolean } {
  const capMm = ratio * t;
  const em = metrics.capPerEm > 0 ? capMm / metrics.capPerEm : capMm;
  const baseline = (t + capMm) / 2;
  const margin = TILE_ENGRAVING_MARGIN_RATIO * t;
  const glyph = font.outline(char, em);
  const b = glyph.bounds;
  if (glyph.rings.length === 0) return { rings: [], shrunk: false };
  let s = 1;
  if (-b.minY > 0) s = Math.min(s, (baseline - margin) / -b.minY);
  if (b.maxY > 0) s = Math.min(s, (t - margin - baseline) / b.maxY);
  if (b.maxX - b.minX > 0) s = Math.min(s, (t - 2 * margin) / (b.maxX - b.minX));
  s = Math.max(0, s);
  const shrunk = s < 1 - 1e-9;
  return { rings: placeRings(glyph.rings, s, t / 2 - (s * (b.minX + b.maxX)) / 2, baseline), shrunk };
}

// Point value digits on a common baseline in the lower-right corner.
function scoreRings(font: FontOutliner, value: number, t: number, metrics: GlyphMetrics): Ring[] {
  const text = String(value);
  const em = (SCORE_HEIGHT_RATIO * t) / (metrics.digitPerEm > 0 ? metrics.digitPerEm : 1);
  const glyph = font.outline(text, em);
  const inset = SCORE_INSET_RATIO * t;
  return placeRings(glyph.rings, 1, t - inset - glyph.bounds.maxX, t - inset);
}

function artworkShapes(asset: ArtworkAsset, t: number): EngravingShape[] | null {
  const { scale, dx, dy } = artworkTransform(asset.bounds, t);
  if (!(scale > 0)) return [];
  const shapes: EngravingShape[] = [];
  for (const shape of asset.shapes) {
    const parsed = parsePathData(shape.d);
    if (!parsed.ok) return null;
    // The tolerance applies in picture units, before scaling.
    const rings = flattenSegments(parsed.segments, ARTWORK_TOLERANCE_MM / scale);
    if (rings.length > 0) shapes.push({ rings: placeRings(rings, scale, dx, dy), fillRule: shape.fillRule });
  }
  return shapes;
}

function translateShape(shape: EngravingShape, dx: number, dy: number): EngravingShape {
  return { fillRule: shape.fillRule, rings: placeRings(shape.rings, 1, dx, dy) };
}

export function buildCrosswordGeometry(input: CrosswordInput): CrosswordGeometry {
  const t = input.tileSizeMm;
  const { originMm, tileFont } = input;
  const ratio = input.letterHeightRatio ?? DEFAULT_LETTER_HEIGHT_RATIO;
  const problems: CrosswordProblem[] = [];
  const names = normalizeNames(input.names).names;
  const cells = occupiedCells(names, input.layout).sort((p, q) => p.y - q.y || p.x - q.x);
  const toMm = (p: GridPosition): Point => ({ x: originMm.x + p.x * t, y: originMm.y + p.y * t });

  // Outline and score lines are exact in grid units, then scaled once.
  const outline = traceOutline(cells);
  const rings = [...outline.outers].sort((p, q) => q.length - p.length);
  if (cells.length === 0) {
    problems.push({ code: "empty", severity: "error", message: "The crossword has no tiles.", positions: [] });
  } else if (componentCount(cells) > 1 || rings.length > 1) {
    problems.push({
      code: "disconnected",
      severity: "error",
      message: "The crossword tiles do not form one connected piece.",
      positions: [],
    });
  }
  const cut = { outer: (rings[0] ?? []).map(toMm), holes: outline.holes.map((h) => h.map(toMm)) };
  const score = internalEdges(cells).map((s) => ({ a: toMm(s.a), b: toMm(s.b) }));

  const metrics: GlyphMetrics = { capPerEm: measure(tileFont, CAP_REFERENCE), digitPerEm: measure(tileFont, DIGIT_REFERENCE) };
  const decoByPos = new Map(input.layout.decorativeTiles.map((d) => [`${d.position.x},${d.position.y}`, d]));
  const missing = new Map<string, GridPosition[]>();
  const shrunk = new Map<string, GridPosition[]>();
  const note = (map: Map<string, GridPosition[]>, char: string, pos: GridPosition): void => {
    const list = map.get(char);
    if (list) list.push(pos);
    else map.set(char, [pos]);
  };
  const artworkCache = new Map<string, EngravingShape[] | null>();

  const tiles: CrosswordTile[] = cells.map((cell) => {
    const pos = { x: cell.x, y: cell.y };
    const corner = toMm(pos);
    const deco = cell.char === TILE_CHAR ? decoByPos.get(`${cell.x},${cell.y}`) : undefined;
    const tile: CrosswordTile = {
      x: cell.x,
      y: cell.y,
      kind: deco ? "decorative" : /^\p{L}$/u.test(cell.char) ? "letter" : "punctuation",
      char: deco ? null : cell.char,
      tileId: deco ? deco.id : null,
      rect: { x: corner.x, y: corner.y, size: t },
      letter: [],
      score: [],
      artwork: [],
    };
    if (deco) {
      const asset = resolveArtwork(input.artwork, deco.artworkId);
      if (asset) {
        if (!artworkCache.has(asset.id)) artworkCache.set(asset.id, artworkShapes(asset, t));
        const shapes = artworkCache.get(asset.id);
        if (shapes === null || shapes === undefined) {
          problems.push({
            code: "artwork-unreadable",
            severity: "error",
            message: `The picture "${asset.name}" could not be read.`,
            positions: [pos],
          });
        } else {
          tile.artwork = shapes.map((s) => translateShape(s, corner.x, corner.y));
        }
      }
      return tile;
    }
    const char = cell.char;
    if (!tileFont.hasGlyphs(char)) {
      note(missing, char, pos);
      return tile;
    }
    const glyph = letterRings(tileFont, char, t, ratio, metrics);
    if (glyph.shrunk) note(shrunk, char, pos);
    tile.letter = placeRings(glyph.rings, 1, corner.x, corner.y);
    const value = input.showScores && tile.kind === "letter" ? letterValue(char) : null;
    if (value !== null) {
      const digits = String(value);
      if (tileFont.hasGlyphs(digits)) tile.score = placeRings(scoreRings(tileFont, value, t, metrics), 1, corner.x, corner.y);
      else for (const d of digits) if (!tileFont.hasGlyphs(d)) note(missing, d, pos);
    }
    return tile;
  });

  for (const [char, positions] of missing) {
    problems.push({
      code: "missing-glyph",
      severity: "error",
      message: `The tile font cannot draw "${char}".`,
      char,
      positions,
    });
  }
  for (const [char, positions] of shrunk) {
    problems.push({
      code: "glyph-shrunk",
      severity: "warning",
      message: `"${char}" was made smaller so it fits inside its tile.`,
      char,
      positions,
    });
  }

  const engraving = {
    letters: tiles.flatMap((x) => x.letter),
    scores: tiles.flatMap((x) => x.score),
    artwork: tiles.flatMap((x) => x.artwork),
  };
  return { tileSizeMm: t, cut, score, engraving, tiles, bounds: ringsBounds([cut.outer]), problems };
}
