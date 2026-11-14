// SVG path data: parse any `d` into absolute M/L/C/Z segments, transform, measure, flatten and serialise.
import type { Bounds, Point, Ring } from "../geometry/types.ts";
import { MAX_ARTWORK_COORDINATE } from "./constants.ts";

export type PathSegment =
  | { type: "M"; x: number; y: number }
  | { type: "L"; x: number; y: number }
  | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: "Z" };

// x' = a·x + c·y + e, y' = b·x + d·y + f (SVG matrix order).
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

// The result applies `inner` first, then `outer`.
export function multiplyAffine(outer: Affine, inner: Affine): Affine {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

export function applyAffine(m: Affine, x: number, y: number): Point {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

export type PathResult = { ok: true; segments: PathSegment[] } | { ok: false; message: string };

export interface ParseOptions {
  // Stored form only: uppercase M/L/C/Z, plain decimals with at most 3 places, no exponents.
  strict?: boolean;
  maxSegments?: number;
}

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const STRICT_NUMBER = /-?\d+(?:\.\d{1,3})?/y;
const COMMANDS = "MmLlHhVvCcSsQqTtAaZz";
const STRICT_COMMANDS = "MLCZ";
// Raw uploads may use large coordinates; they are rescaled afterwards.
const MAX_RAW_COORDINATE = 1e9;
const ARG_COUNT: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };

function isSeparator(ch: string): boolean {
  return ch === " " || ch === "," || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";
}

class PathError extends Error {}

export function parsePathData(d: string, options: ParseOptions = {}): PathResult {
  try {
    return { ok: true, segments: parseOrThrow(d, options) };
  } catch (err) {
    if (err instanceof PathError) return { ok: false, message: err.message };
    throw err;
  }
}

function parseOrThrow(d: string, { strict = false, maxSegments = Infinity }: ParseOptions): PathSegment[] {
  const allowed = strict ? STRICT_COMMANDS : COMMANDS;
  const numberRe = strict ? STRICT_NUMBER : NUMBER;
  const limit = strict ? MAX_ARTWORK_COORDINATE : MAX_RAW_COORDINATE;
  const segments: PathSegment[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let closed = false;
  // Previous control points for S and T reflection.
  let lastCubic: Point | null = null;
  let lastQuad: Point | null = null;

  const push = (s: PathSegment) => {
    segments.push(s);
    if (segments.length > maxSegments) throw new PathError("The shape is too detailed.");
  };
  const skip = () => {
    while (i < d.length && (strict ? d[i] === " " || d[i] === "," : isSeparator(d[i]!))) i++;
  };
  const startsNumber = () => {
    skip();
    const ch = d[i];
    return ch !== undefined && /[0-9+\-.]/.test(ch);
  };
  const num = (): number => {
    skip();
    numberRe.lastIndex = i;
    const m = numberRe.exec(d);
    if (!m) throw new PathError(`Expected a number at position ${i}.`);
    i += m[0].length;
    if (strict && i < d.length && /[0-9.eE]/.test(d[i]!)) throw new PathError(`Malformed number at position ${i}.`);
    const v = Number(m[0]);
    if (!Number.isFinite(v) || Math.abs(v) > limit) throw new PathError("A coordinate is out of range.");
    return v;
  };
  const flag = (): boolean => {
    skip();
    const ch = d[i];
    if (ch !== "0" && ch !== "1") throw new PathError(`Expected an arc flag at position ${i}.`);
    i++;
    return ch === "1";
  };
  // After Z, a drawing command starts a new subpath at the closed subpath's start.
  const open = () => {
    if (closed) {
      push({ type: "M", x: sx, y: sy });
      closed = false;
    }
  };
  const line = (x: number, y: number) => {
    open();
    push({ type: "L", x, y });
    cx = x;
    cy = y;
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    open();
    push({ type: "C", x1, y1, x2, y2, x, y });
    cx = x;
    cy = y;
  };

  let cmd = "";
  skip();
  while (i < d.length) {
    const ch = d[i]!;
    if (/[A-Za-z]/.test(ch)) {
      if (!allowed.includes(ch)) throw new PathError(`Unsupported path command "${ch}".`);
      cmd = ch;
      i++;
    } else if (cmd === "" || cmd === "Z" || cmd === "z") {
      throw new PathError(`Expected a path command at position ${i}.`);
    }
    if (segments.length === 0 && cmd !== "M" && cmd !== "m") throw new PathError("Path data must start with a move command.");
    if (cmd === "Z" || cmd === "z") {
      push({ type: "Z" });
      cx = sx;
      cy = sy;
      closed = true;
      lastCubic = lastQuad = null;
      skip();
      continue;
    }
    if (ARG_COUNT[cmd.toUpperCase()] === undefined) throw new PathError(`Unsupported path command "${cmd}".`);
    do {
      // Recomputed each round: extra pairs after a move become line-tos.
      const op = cmd.toUpperCase();
      const relative = cmd !== op;
      const ox = relative ? cx : 0;
      const oy = relative ? cy : 0;
      let nextCubic: Point | null = null;
      let nextQuad: Point | null = null;
      switch (op) {
        case "M": {
          const x = num() + ox;
          const y = num() + oy;
          push({ type: "M", x, y });
          cx = sx = x;
          cy = sy = y;
          closed = false;
          cmd = relative ? "l" : "L";
          break;
        }
        case "L":
          line(num() + ox, num() + oy);
          break;
        case "H":
          line(num() + ox, cy);
          break;
        case "V":
          line(cx, num() + oy);
          break;
        case "C": {
          const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy, x = num() + ox, y = num() + oy;
          cubic(x1, y1, x2, y2, x, y);
          nextCubic = { x: x2, y: y2 };
          break;
        }
        case "S": {
          const r = lastCubic ? { x: 2 * cx - lastCubic.x, y: 2 * cy - lastCubic.y } : { x: cx, y: cy };
          const x2 = num() + ox, y2 = num() + oy, x = num() + ox, y = num() + oy;
          cubic(r.x, r.y, x2, y2, x, y);
          nextCubic = { x: x2, y: y2 };
          break;
        }
        case "Q": {
          const qx = num() + ox, qy = num() + oy, x = num() + ox, y = num() + oy;
          quadratic(qx, qy, x, y);
          nextQuad = { x: qx, y: qy };
          break;
        }
        case "T": {
          const q: Point = lastQuad ? { x: 2 * cx - lastQuad.x, y: 2 * cy - lastQuad.y } : { x: cx, y: cy };
          const x = num() + ox, y = num() + oy;
          quadratic(q.x, q.y, x, y);
          nextQuad = q;
          break;
        }
        case "A": {
          const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag(), x = num() + ox, y = num() + oy;
          for (const s of arcToSegments(cx, cy, rx, ry, rot, large, sweep, x, y)) {
            if (s.type === "C") cubic(s.x1, s.y1, s.x2, s.y2, s.x, s.y);
            else if (s.type === "L") line(s.x, s.y);
          }
          cx = x;
          cy = y;
          break;
        }
      }
      lastCubic = nextCubic;
      lastQuad = nextQuad;
    } while (startsNumber());
    skip();
  }
  return segments;

  function quadratic(qx: number, qy: number, x: number, y: number) {
    cubic(cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y);
  }
}

function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}

// SVG arc (endpoint form, SVG 1.1 F.6.5) as cubic segments of at most 90° each.
export function arcToSegments(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): PathSegment[] {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [{ type: "L", x: x2, y: y2 }];
  const phi = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cos * dx2 + sin * dy2;
  const y1p = -sin * dx2 + cos * dy2;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (largeArc !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const ccx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const ccy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const theta1 = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = vectorAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / n;
  const t = (4 / 3) * Math.tan(step / 4);
  const map = (ux: number, uy: number): Point => ({
    x: ccx + rx * ux * cos - ry * uy * sin,
    y: ccy + rx * ux * sin + ry * uy * cos,
  });
  const out: PathSegment[] = [];
  for (let k = 0; k < n; k++) {
    const a1 = theta1 + k * step;
    const a2 = a1 + step;
    const c1 = map(Math.cos(a1) - t * Math.sin(a1), Math.sin(a1) + t * Math.cos(a1));
    const c2 = map(Math.cos(a2) + t * Math.sin(a2), Math.sin(a2) - t * Math.cos(a2));
    const end = k === n - 1 ? { x: x2, y: y2 } : map(Math.cos(a2), Math.sin(a2));
    out.push({ type: "C", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: end.x, y: end.y });
  }
  return out;
}

export function transformSegments(segments: readonly PathSegment[], m: Affine): PathSegment[] {
  return segments.map((s) => {
    if (s.type === "Z") return s;
    const p = applyAffine(m, s.x, s.y);
    if (s.type !== "C") return { type: s.type, x: p.x, y: p.y };
    const c1 = applyAffine(m, s.x1, s.y1);
    const c2 = applyAffine(m, s.x2, s.y2);
    return { type: "C", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: p.x, y: p.y };
  });
}

// Drops moves that start nothing (followed by another move, a close or the end) and closes they leave behind.
export function compactSegments(segments: readonly PathSegment[]): PathSegment[] {
  const out: PathSegment[] = [];
  for (let k = 0; k < segments.length; k++) {
    const s = segments[k]!;
    if (s.type === "M") {
      let j = k + 1;
      while (j < segments.length && segments[j]!.type === "Z") j++;
      const next = segments[j];
      if (next === undefined || next.type === "M") {
        k = j - 1;
        continue;
      }
    }
    out.push(s);
  }
  return out;
}

export function hasDrawing(segments: readonly PathSegment[]): boolean {
  return segments.some((s) => s.type === "L" || s.type === "C");
}

// Parameters in (0, 1) where one coordinate of a cubic has a turning point.
function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      roots.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  return roots.filter((t) => t > 0 && t < 1);
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

// Exact bounds, using the curves' true extrema; null when nothing is drawn.
export function segmentsBounds(segments: readonly PathSegment[]): Bounds | null {
  let b: Bounds | null = null;
  const add = (x: number, y: number) => {
    if (!b) b = { minX: x, minY: y, maxX: x, maxY: y };
    else {
      b.minX = Math.min(b.minX, x);
      b.minY = Math.min(b.minY, y);
      b.maxX = Math.max(b.maxX, x);
      b.maxY = Math.max(b.maxY, y);
    }
  };
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  for (const s of compactSegments(segments)) {
    if (s.type === "Z") {
      cx = sx;
      cy = sy;
      continue;
    }
    if (s.type === "M") {
      sx = s.x;
      sy = s.y;
    }
    if (s.type === "C") {
      for (const t of cubicExtrema(cx, s.x1, s.x2, s.x)) add(cubicAt(cx, s.x1, s.x2, s.x, t), cubicAt(cy, s.y1, s.y2, s.y, t));
      for (const t of cubicExtrema(cy, s.y1, s.y2, s.y)) add(cubicAt(cx, s.x1, s.x2, s.x, t), cubicAt(cy, s.y1, s.y2, s.y, t));
    }
    add(s.x, s.y);
    cx = s.x;
    cy = s.y;
  }
  return b;
}

export function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

// One closed ring per subpath; each curve is split so it stays within `tolerance` of the true curve.
export function flattenSegments(segments: readonly PathSegment[], tolerance: number): Ring[] {
  const tol = tolerance > 0 ? tolerance : 0.01;
  const rings: Ring[] = [];
  let ring: Point[] = [];
  let cx = 0;
  let cy = 0;
  const finish = () => {
    const first = ring[0];
    const last = ring.at(-1);
    if (first && last && ring.length > 1 && first.x === last.x && first.y === last.y) ring.pop();
    if (ring.length >= 3) rings.push(ring);
    ring = [];
  };
  for (const s of segments) {
    if (s.type === "M") {
      finish();
      ring.push({ x: s.x, y: s.y });
    } else if (s.type === "L") {
      ring.push({ x: s.x, y: s.y });
    } else if (s.type === "C") {
      // Uniform split error is at most max|B''| / (8 n²), with |B''| <= 6 · the larger second difference.
      const dd = Math.max(Math.hypot(cx - 2 * s.x1 + s.x2, cy - 2 * s.y1 + s.y2), Math.hypot(s.x1 - 2 * s.x2 + s.x, s.y1 - 2 * s.y2 + s.y));
      const n = Math.min(1000, Math.max(1, Math.ceil(Math.sqrt((6 * dd) / (8 * tol)))));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        ring.push({ x: cubicAt(cx, s.x1, s.x2, s.x, t), y: cubicAt(cy, s.y1, s.y2, s.y, t) });
      }
    } else {
      const start = ring[0];
      finish();
      if (start) {
        cx = start.x;
        cy = start.y;
      }
      continue;
    }
    cx = s.x;
    cy = s.y;
  }
  finish();
  return rings;
}

export function formatNumber(v: number, decimals: number): string {
  let s = v.toFixed(decimals);
  if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

export function roundSegments(segments: readonly PathSegment[], decimals: number): PathSegment[] {
  const r = (v: number) => Number(formatNumber(v, decimals));
  return segments.map((s) => {
    if (s.type === "Z") return s;
    if (s.type !== "C") return { type: s.type, x: r(s.x), y: r(s.y) };
    return { type: "C", x1: r(s.x1), y1: r(s.y1), x2: r(s.x2), y2: r(s.y2), x: r(s.x), y: r(s.y) };
  });
}

export function serializeSegments(segments: readonly PathSegment[], decimals: number): string {
  const f = (v: number) => formatNumber(v, decimals);
  return segments
    .map((s) => {
      if (s.type === "Z") return "Z";
      if (s.type === "C") return `C${f(s.x1)} ${f(s.y1)} ${f(s.x2)} ${f(s.y2)} ${f(s.x)} ${f(s.y)}`;
      return `${s.type}${f(s.x)} ${f(s.y)}`;
    })
    .join("");
}
