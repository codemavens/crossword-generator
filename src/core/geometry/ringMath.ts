import type { Bounds, Point, Ring } from "./types.ts";

// Signed shoelace area; the sign depends on winding.
export function signedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!;
    const b = ring[i]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function areaCentroid(ring: Ring): Point {
  let cx = 0;
  let cy = 0;
  let a2 = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!;
    const b = ring[i]!;
    const cross = a.x * b.y - b.x * a.y;
    a2 += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (a2 === 0) return { x: 0, y: 0 };
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}

export function ringsBounds(rings: Ring[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

export function translateRings(rings: Ring[], dx: number, dy: number): Ring[] {
  return rings.map((ring) => ring.map((p) => ({ x: p.x + dx, y: p.y + dy })));
}

// Even-odd point-in-ring test; points exactly on an edge may go either way.
export function pointInRing(p: Point, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distanceToRing(p: Point, ring: Ring): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    best = Math.min(best, distanceToSegment(p, ring[j]!, ring[i]!));
  }
  return best;
}

// Segment count so each chord's sagitta stays within maxSagitta.
export function arcSegments(radius: number, sweep: number, maxSagitta: number): number {
  if (radius <= maxSagitta) return Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
  const step = 2 * Math.acos(1 - maxSagitta / radius);
  return Math.max(1, Math.ceil(Math.abs(sweep) / step));
}

// Points on an arc from angle a0 to a1 (radians, y down), both ends included.
export function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, maxSagitta: number): Point[] {
  const n = arcSegments(r, a1 - a0, maxSagitta);
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}
