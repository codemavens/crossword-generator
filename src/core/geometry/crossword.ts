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
// Values that get the common letter shift; 10 (Q, Z) is placed per glyph.
const SINGLE_DIGIT_VALUES = [1, 2, 3, 4, 5, 8];
const ALL_DIGITS = "0123456789";
// Smallest distance between a letter and its point value, as a fraction of the tile.
export const SCORE_GAP_RATIO = 0.03;
// Search for a clear letter position: nudge step and shrink step, and the smallest scale tried before the last resort.
const NUDGE_STEP_RATIO = 0.01;
const SHRINK_STEP = 0.96;
const MIN_VALUED_SCALE = 0.4;

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

// Where letters sit: em size, the shared baseline, and the common up-left shift of letters on valued tiles.
interface LetterLayout {
  em: number;
  baseline: number;
  valuedShift: number;
  digitEm: number;
  // Shared baseline of point values, raised so descending (old-style) figures keep the inset too.
  digitBaseline: number;
}

function letterLayout(font: FontOutliner, t: number, ratio: number, metrics: GlyphMetrics): LetterLayout {
  const capMm = ratio * t;
  const em = metrics.capPerEm > 0 ? capMm / metrics.capPerEm : capMm;
  const baseline = (t + capMm) / 2;
  const digitEm = (SCORE_HEIGHT_RATIO * t) / (metrics.digitPerEm > 0 ? metrics.digitPerEm : 1);
  const digits = font.hasGlyphs(ALL_DIGITS) ? font.outline(ALL_DIGITS, digitEm).bounds : null;
  const digitBaseline = t * (1 - SCORE_INSET_RATIO) - Math.max(0, digits?.maxY ?? 0);
  const layout: LetterLayout = { em, baseline, valuedShift: 0, digitEm, digitBaseline };
  layout.valuedShift = commonShift(font, t, layout);
  return layout;
}

// Smallest equal left-and-up shift at which the reference capital clears every single-digit value by the gap.
function commonShift(font: FontOutliner, t: number, layout: LetterLayout): number {
  if (!font.hasGlyphs(CAP_REFERENCE)) return 0;
  const ref = font.outline(CAP_REFERENCE, layout.em);
  const b = ref.bounds;
  const margin = TILE_ENGRAVING_MARGIN_RATIO * t;
  const x0 = t / 2 - (b.minX + b.maxX) / 2;
  const maxShift = Math.max(0, Math.min(x0 + b.minX - margin, layout.baseline + b.minY - margin));
  const boxes = SINGLE_DIGIT_VALUES.filter((v) => font.hasGlyphs(String(v))).map((v) =>
    keepOutBox(ringsBounds(scoreRings(font, v, t, layout)), t),
  );
  const step = NUDGE_STEP_RATIO * t;
  for (let u = 0; u < maxShift; u += step) {
    const rings = placeRings(ref.rings, 1, x0 - u, layout.baseline - u);
    if (boxes.every((box) => clearOf(rings, box))) return u;
  }
  return maxShift;
}

function keepOutBox(valueBox: Bounds, t: number): Bounds {
  const gap = SCORE_GAP_RATIO * t;
  return { minX: valueBox.minX - gap, minY: valueBox.minY - gap, maxX: valueBox.maxX + gap, maxY: valueBox.maxY + gap };
}

// Largest scale (<= 1) at which the glyph, sitting on `baseline` and centred, stays inside the tile margin.
function marginScale(b: Bounds, t: number, baseline: number): number {
  const margin = TILE_ENGRAVING_MARGIN_RATIO * t;
  let s = 1;
  if (-b.minY > 0) s = Math.min(s, (baseline - margin) / -b.minY);
  if (b.maxY > 0) s = Math.min(s, (t - margin - baseline) / b.maxY);
  if (b.maxX - b.minX > 0) s = Math.min(s, (t - 2 * margin) / (b.maxX - b.minX));
  return Math.max(0, s);
}

// Character outlines on a shared baseline, centred horizontally; shrunk about the baseline only if they would leave the tile's margin.
function letterRings(font: FontOutliner, char: string, t: number, layout: LetterLayout): { rings: Ring[]; shrunk: boolean } {
  const glyph = font.outline(char, layout.em);
  const b = glyph.bounds;
  if (glyph.rings.length === 0) return { rings: [], shrunk: false };
  const s = marginScale(b, t, layout.baseline);
  return { rings: placeRings(glyph.rings, s, t / 2 - (s * (b.minX + b.maxX)) / 2, layout.baseline), shrunk: s < 1 - 1e-9 };
}

// Point value digits on a common baseline in the lower-right corner, tile-local.
function scoreRings(font: FontOutliner, value: number, t: number, layout: LetterLayout): Ring[] {
  const glyph = font.outline(String(value), layout.digitEm);
  const inset = SCORE_INSET_RATIO * t;
  return placeRings(glyph.rings, 1, t - inset - glyph.bounds.maxX, layout.digitBaseline);
}

// Liang–Barsky: does segment ab enter the closed box?
function segmentHitsBox(a: Point, b: Point, box: Bounds): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const checks: [number, number][] = [
    [-dx, a.x - box.minX],
    [dx, box.maxX - a.x],
    [-dy, a.y - box.minY],
    [dy, box.maxY - a.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

function windingAt(p: Point, rings: Ring[]): number {
  let w = 0;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j]!;
      const c = ring[i]!;
      const side = (c.x - a.x) * (p.y - a.y) - (p.x - a.x) * (c.y - a.y);
      if (a.y <= p.y && c.y > p.y && side > 0) w++;
      else if (a.y > p.y && c.y <= p.y && side < 0) w--;
    }
  }
  return w;
}

// True when no part of the filled letter comes within the (box-expanded) gap of the value.
function clearOf(rings: Ring[], box: Bounds): boolean {
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      if (segmentHitsBox(ring[j]!, ring[i]!, box)) return false;
    }
  }
  return windingAt({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }, rings) === 0;
}

// Valued tile: the letter takes the common up-left shift; a glyph that would still come within the gap of the value
// is nudged further left, then up, within the margin, and only then scaled down step by step.
function valuedLetterRings(
  font: FontOutliner,
  char: string,
  t: number,
  layout: LetterLayout,
  valueBox: Bounds,
): { rings: Ring[]; shrunk: boolean } {
  const glyph = font.outline(char, layout.em);
  const b = glyph.bounds;
  if (glyph.rings.length === 0) return { rings: [], shrunk: false };
  const margin = TILE_ENGRAVING_MARGIN_RATIO * t;
  const keepOut = keepOutBox(valueBox, t);
  const baseline = layout.baseline - layout.valuedShift;
  const step = NUDGE_STEP_RATIO * t;
  const s0 = marginScale(b, t, baseline);
  for (let s = s0; s >= s0 * MIN_VALUED_SCALE; s *= SHRINK_STEP) {
    // A wide glyph cannot take the whole shift without leaving the margin.
    const x0 = Math.max(t / 2 - (s * (b.minX + b.maxX)) / 2 - layout.valuedShift, margin - s * b.minX);
    const room = { left: Math.max(0, x0 + s * b.minX - margin), up: Math.max(0, baseline + s * b.minY - margin) };
    const tries: [number, number][] = [];
    for (let k = 0; k * step < room.left + step; k++) tries.push([-Math.min(room.left, k * step), 0]);
    for (let k = 1; k * step < room.up + step; k++) tries.push([-room.left, -Math.min(room.up, k * step)]);
    for (const [dx, dy] of tries) {
      const rings = placeRings(glyph.rings, s, x0 + dx, baseline + dy);
      if (clearOf(rings, keepOut)) return { rings, shrunk: s < 1 - 1e-9 };
    }
  }
  // Last resort: fit the glyph's box above the value's keep-out band, so the outlines cannot meet.
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const availH = Math.max(0, keepOut.minY - margin);
  const s = Math.min(1, w > 0 ? (t - 2 * margin) / w : 1, h > 0 ? availH / h : 1);
  return { rings: placeRings(glyph.rings, s, t / 2 - (s * (b.minX + b.maxX)) / 2, margin - s * b.minY), shrunk: true };
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
  const letters = letterLayout(tileFont, t, ratio, metrics);
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
    const value = input.showScores && tile.kind === "letter" ? letterValue(char) : null;
    let valueRings: Ring[] = [];
    if (value !== null) {
      const digits = String(value);
      if (tileFont.hasGlyphs(digits)) valueRings = scoreRings(tileFont, value, t, letters);
      else for (const d of digits) if (!tileFont.hasGlyphs(d)) note(missing, d, pos);
    }
    const glyph =
      valueRings.length > 0
        ? valuedLetterRings(tileFont, char, t, letters, ringsBounds(valueRings))
        : letterRings(tileFont, char, t, letters);
    if (glyph.shrunk) note(shrunk, char, pos);
    tile.letter = placeRings(glyph.rings, 1, corner.x, corner.y);
    tile.score = placeRings(valueRings, 1, corner.x, corner.y);
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
