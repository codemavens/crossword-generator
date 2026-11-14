import * as opentypeNs from "opentype.js";
import type { Font, PathCommand } from "opentype.js";
import type { FontOutliner, Point, Ring, TextOutline } from "../geometry/types.ts";
import { ringsBounds } from "../geometry/ringMath.ts";

// Maximum distance between a curve and its flattened polyline, in mm (spec: <= 0.02).
const FLATTEN_TOLERANCE_MM = 0.015;

// Node loads the UMD build (default export only); Vite loads the ESM build (named exports).
function parseFont(data: ArrayBuffer): Font {
  const named = (opentypeNs as { parse?: (b: ArrayBuffer) => Font }).parse;
  const parse = named ?? opentypeNs.default.parse;
  return parse(data);
}

export function createFontOutliner(id: string, data: ArrayBuffer): FontOutliner {
  const font = parseFont(data);
  return {
    id,
    hasGlyphs: (text) => missingChars(font, text.normalize("NFC")).length === 0,
    outline: (text, sizeMm) => outlineText(font, id, text, sizeMm),
  };
}

function missingChars(font: Font, text: string): string[] {
  return Array.from(text).filter((ch) => font.charToGlyphIndex(ch) <= 0);
}

function outlineText(font: Font, id: string, rawText: string, sizeMm: number): TextOutline {
  const text = rawText.normalize("NFC");
  const missing = missingChars(font, text);
  if (missing.length > 0) {
    throw new Error(`Font "${id}" has no glyph for: ${missing.join(" ")}`);
  }
  const path = font.getPath(text, 0, 0, sizeMm, { kerning: true });
  const rings = flattenCommands(path.commands);
  return {
    rings,
    bounds: ringsBounds(rings),
    advanceMm: font.getAdvanceWidth(text, sizeMm, { kerning: true }),
  };
}

function flattenCommands(commands: PathCommand[]): Ring[] {
  const rings: Ring[] = [];
  let current: Point[] = [];
  const finish = (): void => {
    const ring = closeRing(current);
    if (ring.length >= 3) rings.push(ring);
    current = [];
  };
  for (const cmd of commands) {
    const last = current[current.length - 1];
    if (cmd.type === "M") {
      finish();
      current.push(pt(cmd.x, cmd.y));
    } else if (cmd.type === "L") {
      current.push(pt(cmd.x, cmd.y));
    } else if (cmd.type === "Q" && last) {
      flattenQuad(current, last, pt(cmd.x1, cmd.y1), pt(cmd.x, cmd.y));
    } else if (cmd.type === "C" && last) {
      flattenCubic(current, last, pt(cmd.x1, cmd.y1), pt(cmd.x2, cmd.y2), pt(cmd.x, cmd.y));
    } else if (cmd.type === "Z") {
      finish();
    }
  }
  finish();
  return rings;
}

function pt(x: number | undefined, y: number | undefined): Point {
  return { x: x ?? 0, y: y ?? 0 };
}

// Drops the repeated closing point and consecutive duplicates.
function closeRing(points: Point[]): Ring {
  const out: Ring = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) out.push(p);
  }
  const first = out[0];
  const end = out[out.length - 1];
  if (out.length > 1 && first && end && first.x === end.x && first.y === end.y) out.pop();
  return out;
}

// Upper bound on steps per curve, so absurd sizes cannot allocate without bound.
const MAX_CURVE_STEPS = 1024;

// Chord error with n uniform steps is |B''| / (8 n^2).
function stepsFor(maxSecondDerivative: number): number {
  const n = Math.ceil(Math.sqrt(maxSecondDerivative / (8 * FLATTEN_TOLERANCE_MM)));
  return Number.isFinite(n) ? Math.min(MAX_CURVE_STEPS, Math.max(1, n)) : 1;
}

function flattenQuad(out: Point[], p0: Point, p1: Point, p2: Point): void {
  const dd = Math.hypot(p0.x - 2 * p1.x + p2.x, p0.y - 2 * p1.y + p2.y) * 2;
  const n = stepsFor(dd);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
}

function flattenCubic(out: Point[], p0: Point, p1: Point, p2: Point, p3: Point): void {
  const a = Math.hypot(p0.x - 2 * p1.x + p2.x, p0.y - 2 * p1.y + p2.y);
  const b = Math.hypot(p1.x - 2 * p2.x + p3.x, p1.y - 2 * p2.y + p3.y);
  const n = stepsFor(6 * Math.max(a, b));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const c0 = u * u * u;
    const c1 = 3 * u * u * t;
    const c2 = 3 * u * t * t;
    const c3 = t * t * t;
    out.push({
      x: c0 * p0.x + c1 * p1.x + c2 * p2.x + c3 * p3.x,
      y: c0 * p0.y + c1 * p1.y + c2 * p2.y + c3 * p3.y,
    });
  }
}
