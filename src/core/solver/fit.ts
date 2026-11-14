// Fit of a crossword inside the frame opening (SPEC §9 as amended). Tile units throughout unless named *Mm.
import type { FrameGeometry, Point } from "../geometry/types.ts";
import { distanceToSegment, signedArea } from "../geometry/ringMath.ts";
import type { CrosswordLayout, GridPosition, NameEntry } from "../models/project.ts";
import { cellsBounds, layoutCells } from "./grid.ts";
import { normalizeNames } from "./normalize.ts";
import type { FitResult, LayoutBounds, SolverOpening } from "./types.ts";

export function openingForSolver(
  usableOpening: FrameGeometry["usableOpening"],
  tileSizeMm: number,
  clearanceMm: number,
): SolverOpening {
  const s = tileSizeMm > 0 && Number.isFinite(tileSizeMm) ? tileSizeMm : 1;
  return {
    polygon: usableOpening.polygon.map((p) => ({ x: p.x / s, y: p.y / s })),
    centroid: { x: usableOpening.centroid.x / s, y: usableOpening.centroid.y / s },
    clearance: Math.max(0, clearanceMm) / s,
    tileSizeMm: s,
  };
}

// Top-left of grid square (0, 0) in tile units: the bounding rectangle's centre sits on centroid + offset.
export function gridOrigin(bounds: LayoutBounds, centroid: Point, offset: Point): Point {
  return {
    x: centroid.x + offset.x - (bounds.minX + bounds.width / 2),
    y: centroid.y + offset.y - (bounds.minY + bounds.height / 2),
  };
}

// Frame-space mm position of grid square (0, 0)'s top-left corner (SPEC §9 amendment).
export function gridOriginMm(
  layout: CrosswordLayout,
  names: NameEntry[],
  centroidMm: Point,
  tileSizeMm: number,
): Point {
  const bounds = cellsBounds(layoutCells(normalizeNames(names).names, layout));
  const o = gridOrigin(bounds, { x: centroidMm.x / tileSizeMm, y: centroidMm.y / tileSizeMm }, {
    x: layout.offset.xMm / tileSizeMm,
    y: layout.offset.yMm / tileSizeMm,
  });
  return { x: o.x * tileSizeMm, y: o.y * tileSizeMm };
}

interface Edge {
  a: Point;
  b: Point;
}

export interface FitChecker {
  readonly empty: boolean;
  // Square [x, x+1] × [y, y+1] wholly inside the opening and at least `clearance` from its edge.
  squareFits(x: number, y: number): boolean;
  // Opening extent (tile units) after the clearance, and its effective radius sqrt(area / π) − clearance.
  readonly width: number;
  readonly height: number;
  readonly effectiveRadius: number;
  readonly centroid: Point;
  readonly tileSizeMm: number;
}

// Edges are bucketed into unit cells once, so each square test looks only at nearby edges.
export function createFitChecker(opening: SolverOpening): FitChecker {
  const poly = opening.polygon;
  const c = Math.max(0, opening.clearance);
  const empty = poly.length < 3;
  const edges: Edge[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    edges.push({ a: poly[j]!, b: poly[i]! });
    minX = Math.min(minX, poly[i]!.x);
    minY = Math.min(minY, poly[i]!.y);
    maxX = Math.max(maxX, poly[i]!.x);
    maxY = Math.max(maxY, poly[i]!.y);
  }
  const buckets = new Map<string, number[]>();
  const rows = new Map<number, number[]>();
  if (!empty) {
    edges.forEach((e, id) => {
      const x0 = Math.floor(Math.min(e.a.x, e.b.x) - c);
      const x1 = Math.floor(Math.max(e.a.x, e.b.x) + c);
      const y0 = Math.floor(Math.min(e.a.y, e.b.y) - c);
      const y1 = Math.floor(Math.max(e.a.y, e.b.y) + c);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gy = y0; gy <= y1; gy++) {
          const key = `${gx},${gy}`;
          const list = buckets.get(key);
          if (list) list.push(id);
          else buckets.set(key, [id]);
        }
      }
      for (let gy = Math.floor(Math.min(e.a.y, e.b.y)); gy <= Math.floor(Math.max(e.a.y, e.b.y)); gy++) {
        const list = rows.get(gy);
        if (list) list.push(id);
        else rows.set(gy, [id]);
      }
    });
  }

  const inside = (p: Point): boolean => {
    let result = false;
    for (const id of rows.get(Math.floor(p.y)) ?? []) {
      const { a, b } = edges[id]!;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  };

  const minGap = Math.max(c, 1e-9);
  const cache = new Map<string, boolean>();
  const squareFits = (x: number, y: number): boolean => {
    if (empty) return false;
    // Rounded so the same square reached through different float sums shares an entry.
    const key = `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;
    const known = cache.get(key);
    if (known !== undefined) return known;
    let ok = inside({ x: x + 0.5, y: y + 0.5 });
    if (ok) {
      const seen = new Set<number>();
      outer: for (let gx = Math.floor(x - c); gx <= Math.floor(x + 1 + c); gx++) {
        for (let gy = Math.floor(y - c); gy <= Math.floor(y + 1 + c); gy++) {
          for (const id of buckets.get(`${gx},${gy}`) ?? []) {
            if (seen.has(id)) continue;
            seen.add(id);
            const e = edges[id]!;
            if (segmentRectDistance(e.a, e.b, x, y, x + 1, y + 1) < minGap) {
              ok = false;
              break outer;
            }
          }
        }
      }
    }
    if (cache.size < 200000) cache.set(key, ok);
    return ok;
  };

  const area = empty ? 0 : Math.abs(signedArea(poly));
  return {
    empty,
    squareFits,
    width: empty ? 0 : Math.max(0, maxX - minX - 2 * c),
    height: empty ? 0 : Math.max(0, maxY - minY - 2 * c),
    effectiveRadius: empty ? 0 : Math.max(0.5, Math.sqrt(area / Math.PI) - c),
    centroid: opening.centroid,
    tileSizeMm: opening.tileSizeMm,
  };
}

function pointRectDistance(p: Point, x0: number, y0: number, x1: number, y1: number): number {
  const dx = Math.max(x0 - p.x, 0, p.x - x1);
  const dy = Math.max(y0 - p.y, 0, p.y - y1);
  return Math.hypot(dx, dy);
}

// Liang–Barsky: does segment ab enter the closed rectangle?
function segmentHitsRect(a: Point, b: Point, x0: number, y0: number, x1: number, y1: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const checks: [number, number][] = [
    [-dx, a.x - x0],
    [dx, x1 - a.x],
    [-dy, a.y - y0],
    [dy, y1 - a.y],
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

function segmentRectDistance(a: Point, b: Point, x0: number, y0: number, x1: number, y1: number): number {
  if (segmentHitsRect(a, b, x0, y0, x1, y1)) return 0;
  return Math.min(
    pointRectDistance(a, x0, y0, x1, y1),
    pointRectDistance(b, x0, y0, x1, y1),
    distanceToSegment({ x: x0, y: y0 }, a, b),
    distanceToSegment({ x: x1, y: y0 }, a, b),
    distanceToSegment({ x: x0, y: y1 }, a, b),
    distanceToSegment({ x: x1, y: y1 }, a, b),
  );
}

// Fit of an arbitrary set of grid cells; `offset` is in tile units.
export function fitCells(checker: FitChecker, cells: readonly GridPosition[], offset: Point = { x: 0, y: 0 }): FitResult {
  const bounds = cellsBounds(cells);
  const o = gridOrigin(bounds, checker.centroid, offset);
  const tilesOutside: GridPosition[] = [];
  for (const cell of cells) {
    if (!checker.squareFits(o.x + cell.x, o.y + cell.y)) tilesOutside.push({ x: cell.x, y: cell.y });
  }
  return { fits: cells.length > 0 && tilesOutside.length === 0, tilesOutside, tileCount: cells.length };
}

// Re-checks a saved layout, e.g. after the frame settings change.
export function checkFit(layout: CrosswordLayout, names: NameEntry[], opening: SolverOpening): FitResult {
  const checker = createFitChecker(opening);
  const cells = layoutCells(normalizeNames(names).names, layout);
  const s = checker.tileSizeMm > 0 ? checker.tileSizeMm : 1;
  return fitCells(checker, cells, { x: layout.offset.xMm / s, y: layout.offset.yMm / s });
}
