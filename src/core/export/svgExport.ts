// Production SVG export (SPEC §17, CHG-0008 Stage C): pure functions from geometry to SVG text, 1 unit = 1 mm.
// Only numbers and fixed strings reach the output; no user text is ever passed in.
import type { CrosswordGeometry, EngravingShape, Segment } from "../geometry/crossword.ts";
import type { Circle, FrameGeometry, Point, Ring } from "../geometry/types.ts";
import { unionByFillRule } from "../geometry/polygonOps.ts";

export interface OperationColours {
  cut: string;
  score: string;
  engrave: string;
}

export const DEFAULT_OPERATION_COLOURS: Readonly<OperationColours> = Object.freeze({
  cut: "#FF0000",
  score: "#0000FF",
  engrave: "#000000",
});

export type ExportFileName = "crossword.svg" | "frame.svg" | "backer.svg";

// Always a valid SVG; empty geometry gives a margin-only page with no groups (`isEmpty` true).
export interface ExportedFile {
  fileName: ExportFileName;
  svg: string;
  widthMm: number;
  heightMm: number;
  isEmpty: boolean;
}

// Space around each piece, in mm.
export const EXPORT_MARGIN_MM = 1;
// Hairline stroke for cut and score vectors, in mm.
export const HAIRLINE_MM = 0.1;

const COLOUR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const SVG_NS = "http://www.w3.org/2000/svg";
const INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape";

export function resolveColours(colours?: Partial<OperationColours>): OperationColours {
  const pick = (value: unknown, fallback: string): string =>
    typeof value === "string" && COLOUR_PATTERN.test(value) ? value.toUpperCase() : fallback;
  return {
    cut: pick(colours?.cut, DEFAULT_OPERATION_COLOURS.cut),
    score: pick(colours?.score, DEFAULT_OPERATION_COLOURS.score),
    engrave: pick(colours?.engrave, DEFAULT_OPERATION_COLOURS.engrave),
  };
}

// At most 3 decimals, no exponent, no "-0"; non-finite values never reach here.
export function formatMm(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  if (r === 0 || !Number.isFinite(r)) return "0";
  return r.toFixed(3).replace(/\.?0+$/, "");
}

// Everything one file draws, in geometry coordinates; cut paths are written before cut circles.
interface PieceContent {
  engrave: Ring[][];
  score: Segment[];
  cutPaths: Ring[];
  cutCircles: Circle[];
}

const finitePoint = (p: Point): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);
const finiteRing = (r: Ring): boolean => r.length >= 3 && r.every(finitePoint);

function cleanContent(c: PieceContent): PieceContent {
  return {
    engrave: c.engrave.map((rings) => rings.filter(finiteRing)).filter((rings) => rings.length > 0),
    score: c.score.filter((s) => finitePoint(s.a) && finitePoint(s.b)),
    cutPaths: c.cutPaths.filter(finiteRing),
    cutCircles: c.cutCircles.filter((k) => [k.cx, k.cy, k.r].every(Number.isFinite) && k.r > 0),
  };
}

function contentBounds(c: PieceContent): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const rings of c.engrave) for (const ring of rings) for (const p of ring) add(p.x, p.y);
  for (const ring of c.cutPaths) for (const p of ring) add(p.x, p.y);
  for (const s of c.score) {
    add(s.a.x, s.a.y);
    add(s.b.x, s.b.y);
  }
  for (const k of c.cutCircles) {
    add(k.cx - k.r, k.cy - k.r);
    add(k.cx + k.r, k.cy + k.r);
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

// Closed path data after translation; consecutive points that round to the same value are dropped.
function ringData(ring: Ring, dx: number, dy: number): string | null {
  const pts: string[] = [];
  for (const p of ring) {
    const s = `${formatMm(p.x + dx)} ${formatMm(p.y + dy)}`;
    if (pts[pts.length - 1] !== s) pts.push(s);
  }
  while (pts.length > 1 && pts[0] === pts[pts.length - 1]) pts.pop();
  if (pts.length < 3) return null;
  return `M${pts[0]}${pts.slice(1).map((s) => ` L${s}`).join("")} Z`;
}

function group(id: string, label: string, body: string[]): string {
  if (body.length === 0) return "";
  return `<g id="${id}" inkscape:groupmode="layer" inkscape:label="${label}">\n${body.join("\n")}\n</g>\n`;
}

function renderSvg(fileName: ExportFileName, raw: PieceContent, colours: OperationColours): ExportedFile {
  const content = cleanContent(raw);
  const b = contentBounds(content);
  const m = EXPORT_MARGIN_MM;
  const dx = b ? m - b.minX : 0;
  const dy = b ? m - b.minY : 0;
  const width = formatMm(b ? b.maxX - b.minX + 2 * m : 2 * m);
  const height = formatMm(b ? b.maxY - b.minY + 2 * m : 2 * m);
  const stroke = (colour: string): string => `fill="none" stroke="${colour}" stroke-width="${formatMm(HAIRLINE_MM)}"`;

  const engrave: string[] = [];
  for (const rings of content.engrave) {
    const d = rings.map((r) => ringData(r, dx, dy)).filter((s): s is string => s !== null);
    if (d.length > 0) engrave.push(`<path d="${d.join(" ")}" fill="${colours.engrave}" stroke="none" fill-rule="evenodd"/>`);
  }
  const score: string[] = [];
  for (const s of content.score) {
    const a = `${formatMm(s.a.x + dx)} ${formatMm(s.a.y + dy)}`;
    const e = `${formatMm(s.b.x + dx)} ${formatMm(s.b.y + dy)}`;
    if (a !== e) score.push(`<path d="M${a} L${e}" ${stroke(colours.score)}/>`);
  }
  const cut: string[] = [];
  for (const ring of content.cutPaths) {
    const d = ringData(ring, dx, dy);
    if (d) cut.push(`<path d="${d}" ${stroke(colours.cut)}/>`);
  }
  for (const k of content.cutCircles) {
    const attrs = `cx="${formatMm(k.cx + dx)}" cy="${formatMm(k.cy + dy)}" r="${formatMm(k.r)}"`;
    cut.push(`<circle ${attrs} ${stroke(colours.cut)}/>`);
  }

  const groups = group("engrave", "Engrave", engrave) + group("score", "Score", score) + group("cut", "Cut", cut);
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="${SVG_NS}" xmlns:inkscape="${INKSCAPE_NS}" version="1.1" ` +
    `width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">\n` +
    groups +
    `</svg>\n`;
  return { fileName, svg, widthMm: Number(width), heightMm: Number(height), isEmpty: groups === "" };
}

// Overlap-free rings: each shape by its own rule, then the shapes together (non-zero).
function normaliseShapes(shapes: EngravingShape[]): Ring[] {
  const parts = shapes.flatMap((s) => unionByFillRule(s.rings, s.fillRule));
  return shapes.length === 1 ? parts : unionByFillRule(parts, "nonzero");
}

function fontRings(rings: Ring[]): Ring[] {
  return rings.length > 0 ? unionByFillRule(rings, "nonzero") : [];
}

// Hole cuts first, then the outer silhouette. Exports whatever geometry exists; blocking errors are the caller's gate.
export function exportCrosswordSvg(geometry: CrosswordGeometry, colours?: Partial<OperationColours>): ExportedFile {
  const engrave: Ring[][] = [];
  for (const tile of geometry.tiles) {
    engrave.push(fontRings(tile.letter), fontRings(tile.score));
    if (tile.artwork.length > 0) engrave.push(normaliseShapes(tile.artwork));
  }
  return renderSvg(
    "crossword.svg",
    { engrave, score: geometry.score, cutPaths: [...geometry.cut.holes, geometry.cut.outer], cutCircles: [] },
    resolveColours(colours),
  );
}

// Inner cut path, then the outer circle; the family name is unioned as a whole because script letters overlap.
export function exportFrameSvg(geometry: FrameGeometry, colours?: Partial<OperationColours>): ExportedFile {
  const engrave = [fontRings(geometry.engraving.name), fontRings(geometry.engraving.year)];
  return renderSvg(
    "frame.svg",
    { engrave, score: [], cutPaths: geometry.innerCut.length > 0 ? [geometry.innerCut] : [], cutCircles: [geometry.outer] },
    resolveColours(colours),
  );
}

export function exportBackerSvg(geometry: FrameGeometry, colours?: Partial<OperationColours>): ExportedFile {
  return renderSvg("backer.svg", { engrave: [], score: [], cutPaths: [], cutCircles: [geometry.backer] }, resolveColours(colours));
}
