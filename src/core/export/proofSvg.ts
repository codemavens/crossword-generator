// Customer proof picture (CHG-0008 AC28): the assembled product from geometry only, 1 unit = 1 mm.
// No user text, no <text>/<image>, no references; cut colours and editing aids are left out.
import type { Design } from "../design/buildDesign.ts";
import type { Circle, Ring } from "../geometry/types.ts";
import type { Segment } from "../geometry/crossword.ts";
import { formatMm } from "./svgExport.ts";

// Same tones as the on-screen preview.
export const PROOF_COLOURS = {
  backer: "#ecd9b4",
  frame: "#c99a5b",
  piece: "#e2c38f",
  engraving: "#3b2a18",
} as const;
// Thin dark lines between tiles and around the pieces.
const LINE_COLOUR = "#6b4a24";
const TILE_LINE_MM = 0.25;
const EDGE_LINE_MM = 0.2;
const SVG_NS = "http://www.w3.org/2000/svg";

export interface ProofOptions {
  marginMm?: number;
  // "white" draws a plain white page; "transparent" leaves it clear.
  background?: "white" | "transparent";
  // Draw at this width in pixels (height in proportion) instead of in mm, for rasterising.
  widthPx?: number;
}

export interface ProofSvg {
  svg: string;
  widthMm: number;
  heightMm: number;
}

const f = (n: number): string => formatMm(n);

function ringPath(ring: Ring, dx: number, dy: number): string {
  const pts = ring.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 3) return "";
  return `M${pts.map((p) => `${f(p.x + dx)} ${f(p.y + dy)}`).join(" L")} Z`;
}

const ringsPath = (rings: Ring[], dx: number, dy: number): string =>
  rings.map((r) => ringPath(r, dx, dy)).filter((s) => s !== "").join(" ");

function circlePath(c: Circle, dx: number, dy: number): string {
  const cx = c.cx + dx;
  const cy = c.cy + dy;
  return `M${f(cx - c.r)} ${f(cy)} A${f(c.r)} ${f(c.r)} 0 1 0 ${f(cx + c.r)} ${f(cy)} A${f(c.r)} ${f(c.r)} 0 1 0 ${f(cx - c.r)} ${f(cy)} Z`;
}

function segmentsPath(segments: Segment[], dx: number, dy: number): string {
  return segments
    .filter((s) => [s.a.x, s.a.y, s.b.x, s.b.y].every(Number.isFinite))
    .map((s) => `M${f(s.a.x + dx)} ${f(s.a.y + dy)} L${f(s.b.x + dx)} ${f(s.b.y + dy)}`)
    .join(" ");
}

// Null when the design has no frame to show; the crossword is drawn only when it exists.
export function buildProofSvg(design: Design, options: ProofOptions = {}): ProofSvg | null {
  const frame = design.frame;
  if (!frame) return null;
  const margin = Math.max(0, options.marginMm ?? 5);
  const { outer, backer, innerCut, engraving } = frame;
  const piece = design.crossword;

  let minX = Math.min(outer.cx - outer.r, backer.cx - backer.r);
  let maxX = Math.max(outer.cx + outer.r, backer.cx + backer.r);
  let minY = Math.min(outer.cy - outer.r, backer.cy - backer.r);
  let maxY = Math.max(outer.cy + outer.r, backer.cy + backer.r);
  if (piece && [piece.bounds.minX, piece.bounds.minY, piece.bounds.maxX, piece.bounds.maxY].every(Number.isFinite)) {
    minX = Math.min(minX, piece.bounds.minX);
    maxX = Math.max(maxX, piece.bounds.maxX);
    minY = Math.min(minY, piece.bounds.minY);
    maxY = Math.max(maxY, piece.bounds.maxY);
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  const dx = margin - minX;
  const dy = margin - minY;
  const width = f(maxX - minX + 2 * margin);
  const height = f(maxY - minY + 2 * margin);

  const edge = (colour: string, w: number) => `fill="none" stroke="${colour}" stroke-width="${f(w)}"`;
  const out: string[] = [];
  if ((options.background ?? "white") === "white") {
    out.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`);
  }
  out.push(`<path d="${circlePath(backer, dx, dy)}" fill="${PROOF_COLOURS.backer}" stroke="${LINE_COLOUR}" stroke-width="${f(EDGE_LINE_MM)}"/>`);
  const inner = innerCut.length > 0 ? ringPath(innerCut, dx, dy) : "";
  const frameD = inner ? `${circlePath(outer, dx, dy)} ${inner}` : circlePath(outer, dx, dy);
  out.push(`<path d="${frameD}" fill="${PROOF_COLOURS.frame}" fill-rule="evenodd" stroke="${LINE_COLOUR}" stroke-width="${f(EDGE_LINE_MM)}"/>`);
  for (const rings of [engraving.name, engraving.year]) {
    const d = ringsPath(rings, dx, dy);
    if (d) out.push(`<path d="${d}" fill="${PROOF_COLOURS.engraving}" fill-rule="nonzero" stroke="none"/>`);
  }
  if (piece) {
    const cutD = ringsPath([piece.cut.outer, ...piece.cut.holes], dx, dy);
    if (cutD) out.push(`<path d="${cutD}" fill="${PROOF_COLOURS.piece}" fill-rule="evenodd" stroke="${LINE_COLOUR}" stroke-width="${f(EDGE_LINE_MM)}"/>`);
    const scoreD = segmentsPath(piece.score, dx, dy);
    if (scoreD) out.push(`<path d="${scoreD}" ${edge(LINE_COLOUR, TILE_LINE_MM)}/>`);
    const letterD = ringsPath([...piece.engraving.letters, ...piece.engraving.scores], dx, dy);
    if (letterD) out.push(`<path d="${letterD}" fill="${PROOF_COLOURS.engraving}" fill-rule="nonzero" stroke="none"/>`);
    for (const shape of piece.engraving.artwork) {
      const d = ringsPath(shape.rings, dx, dy);
      if (d) out.push(`<path d="${d}" fill="${PROOF_COLOURS.engraving}" fill-rule="${shape.fillRule}" stroke="none"/>`);
    }
  }

  const px = options.widthPx;
  const size =
    px !== undefined && Number.isFinite(px) && px > 0
      ? `width="${Math.round(px)}" height="${Math.max(1, Math.round((px * Number(height)) / Number(width)))}"`
      : `width="${width}mm" height="${height}mm"`;
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="${SVG_NS}" version="1.1" ${size} viewBox="0 0 ${width} ${height}">\n` +
    `${out.join("\n")}\n</svg>\n`;
  return { svg, widthMm: Number(width), heightMm: Number(height) };
}
