// Exact outline and internal edges of a set of unit grid squares, in grid units (y down).
import type { GridPosition } from "../models/project.ts";

export interface GridSegment {
  a: GridPosition;
  b: GridPosition;
}

export interface GridOutline {
  // Positive signed area (clockwise on screen, y down), interior on the right of travel.
  outers: GridPosition[][];
  // Negative signed area (counter-clockwise on screen).
  holes: GridPosition[][];
}

const key = (x: number, y: number): string => `${x},${y}`;

// Direction index: 0 right, 1 down, 2 left, 3 up (y down).
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

interface DirectedEdge {
  x: number;
  y: number;
  dir: number;
  used: boolean;
}

function signedArea(ring: readonly GridPosition[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y;
  }
  return sum / 2;
}

// Drops vertices where the direction does not change, and starts at the smallest (y, x) vertex.
function simplify(points: GridPosition[]): GridPosition[] {
  const n = points.length;
  const kept: GridPosition[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!;
    const cur = points[i]!;
    const next = points[(i + 1) % n]!;
    const cross = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
    if (cross !== 0) kept.push(cur);
  }
  let start = 0;
  kept.forEach((p, i) => {
    const s = kept[start]!;
    if (p.y < s.y || (p.y === s.y && p.x < s.x)) start = i;
  });
  return [...kept.slice(start), ...kept.slice(0, start)];
}

export function cellSet(cells: readonly GridPosition[]): Set<string> {
  return new Set(cells.map((c) => key(c.x, c.y)));
}

// Boundary edges run clockwise around each square, so shared edges are never emitted and the piece is on the right.
// Where two squares touch only diagonally, the left turn is taken, keeping the edges around the same empty region together:
// the outer ring and a hole then stay separate simple rings that meet at that point only.
export function traceOutline(cells: readonly GridPosition[]): GridOutline {
  const occupied = cellSet(cells);
  const has = (x: number, y: number): boolean => occupied.has(key(x, y));
  const edges: DirectedEdge[] = [];
  const sorted = [...cells].sort((p, q) => p.y - q.y || p.x - q.x);
  const seen = new Set<string>();
  for (const { x, y } of sorted) {
    const k = key(x, y);
    if (seen.has(k)) continue;
    seen.add(k);
    if (!has(x, y - 1)) edges.push({ x, y, dir: 0, used: false });
    if (!has(x + 1, y)) edges.push({ x: x + 1, y, dir: 1, used: false });
    if (!has(x, y + 1)) edges.push({ x: x + 1, y: y + 1, dir: 2, used: false });
    if (!has(x - 1, y)) edges.push({ x, y: y + 1, dir: 3, used: false });
  }
  const byStart = new Map<string, DirectedEdge[]>();
  for (const e of edges) {
    const k = key(e.x, e.y);
    const list = byStart.get(k);
    if (list) list.push(e);
    else byStart.set(k, [e]);
  }
  const outers: GridPosition[][] = [];
  const holes: GridPosition[][] = [];
  for (const first of edges) {
    if (first.used) continue;
    const points: GridPosition[] = [];
    let e: DirectedEdge | undefined = first;
    while (e && !e.used) {
      e.used = true;
      points.push({ x: e.x, y: e.y });
      const ex: number = e.x + DX[e.dir]!;
      const ey: number = e.y + DY[e.dir]!;
      const dir: number = e.dir;
      // Left turn first, then straight, then right; a fixed pairing, so the walk closes exactly on its first edge.
      const options: DirectedEdge[] = byStart.get(key(ex, ey)) ?? [];
      e = [3, 0, 1].map((t) => options.find((o) => o.dir === (dir + t) % 4)).find((o) => o !== undefined);
    }
    const ring = simplify(points);
    if (ring.length < 4) continue;
    (signedArea(ring) > 0 ? outers : holes).push(ring);
  }
  return { outers, holes };
}

// Every edge shared by two squares, merged into maximal straight runs; vertical lines first, then horizontal.
export function internalEdges(cells: readonly GridPosition[]): GridSegment[] {
  const occupied = cellSet(cells);
  const vertical = new Map<number, number[]>();
  const horizontal = new Map<number, number[]>();
  const add = (map: Map<number, number[]>, line: number, at: number): void => {
    const list = map.get(line);
    if (list) list.push(at);
    else map.set(line, [at]);
  };
  for (const k of occupied) {
    const [x, y] = k.split(",").map(Number) as [number, number];
    if (occupied.has(key(x + 1, y))) add(vertical, x + 1, y);
    if (occupied.has(key(x, y + 1))) add(horizontal, y + 1, x);
  }
  const runs = (map: Map<number, number[]>, make: (line: number, from: number, to: number) => GridSegment): GridSegment[] => {
    const out: GridSegment[] = [];
    for (const line of [...map.keys()].sort((p, q) => p - q)) {
      const starts = map.get(line)!.sort((p, q) => p - q);
      let from = starts[0]!;
      let to = from + 1;
      for (const s of starts.slice(1)) {
        if (s === to) {
          to++;
        } else {
          out.push(make(line, from, to));
          from = s;
          to = s + 1;
        }
      }
      out.push(make(line, from, to));
    }
    return out;
  };
  return [
    ...runs(vertical, (x, y0, y1) => ({ a: { x, y: y0 }, b: { x, y: y1 } })),
    ...runs(horizontal, (y, x0, x1) => ({ a: { x: x0, y }, b: { x: x1, y } })),
  ];
}

// Number of edge-connected groups of squares.
export function componentCount(cells: readonly GridPosition[]): number {
  const occupied = cellSet(cells);
  const visited = new Set<string>();
  let count = 0;
  for (const start of occupied) {
    if (visited.has(start)) continue;
    count++;
    const stack = [start];
    visited.add(start);
    while (stack.length > 0) {
      const [x, y] = stack.pop()!.split(",").map(Number) as [number, number];
      for (let d = 0; d < 4; d++) {
        const n = key(x + DX[d]!, y + DY[d]!);
        if (occupied.has(n) && !visited.has(n)) {
          visited.add(n);
          stack.push(n);
        }
      }
    }
  }
  return count;
}
