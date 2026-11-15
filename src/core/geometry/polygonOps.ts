// The only module that talks to clipper2-ts. Fill rule is always non-zero.
import {
  ClipType,
  EndType,
  FillRule,
  JoinType,
  Minkowski,
  areaD,
  booleanOpD,
  differenceD,
  inflatePathsD,
  simplifyPathD,
  unionD,
} from "clipper2-ts";
import type { PathD, PathsD } from "clipper2-ts";
import type { Point, Ring } from "./types.ts";

// Decimal places kept by clipper (0.0001 mm).
const PRECISION = 4;
// Max deviation of offset arcs from a true circle, in mm.
const ARC_TOLERANCE_MM = 0.01;

function toPaths(rings: Ring[]): PathsD {
  return rings.map((r) => r.map((p) => ({ x: p.x, y: p.y })));
}

function toRings(paths: PathsD): Ring[] {
  return paths.map((path) => path.map((p): Point => ({ x: p.x, y: p.y }))).filter((r) => r.length >= 3);
}

export function unionAll(rings: Ring[]): Ring[] {
  return toRings(booleanOpD(ClipType.Union, toPaths(rings), null, FillRule.NonZero, PRECISION));
}

export function unionWith(a: Ring[], b: Ring[]): Ring[] {
  return toRings(unionD(toPaths(a), toPaths(b), FillRule.NonZero, PRECISION));
}

export function subtract(subject: Ring[], clip: Ring[]): Ring[] {
  return toRings(differenceD(toPaths(subject), toPaths(clip), FillRule.NonZero, PRECISION));
}

// Grows (delta > 0) or shrinks (delta < 0) closed shapes with round joins.
export function offsetRound(rings: Ring[], delta: number): Ring[] {
  if (delta === 0) return rings;
  const out = inflatePathsD(toPaths(rings), delta, JoinType.Round, EndType.Polygon, 2, PRECISION, ARC_TOLERANCE_MM);
  return toRings(out);
}

// Clipper returns outer rings with positive area and holes with negative area.
export function isOuter(ring: Ring): boolean {
  return areaD(ring as PathD) > 0;
}

export function outerRings(rings: Ring[]): Ring[] {
  return rings.filter(isOuter);
}

export function ringArea(ring: Ring): number {
  return Math.abs(areaD(ring as PathD));
}

// Sweeps each ring straight down by `length` (Minkowski sum with a vertical segment).
export function extendDown(rings: Ring[], length: number): Ring[] {
  const segment: PathD = [
    { x: 0, y: 0 },
    { x: 0, y: length },
  ];
  const swept: PathsD = [];
  for (const ring of rings) {
    swept.push(...Minkowski.sumD(segment, ring as PathD, true, PRECISION));
  }
  return unionWith(toRings(swept), rings);
}

// Removes near-duplicate and near-collinear points within epsilon mm.
export function simplifyRing(ring: Ring, epsilon: number): Ring {
  return toRings([simplifyPathD(ring as PathD, epsilon, true)])[0] ?? ring;
}

// Union under a chosen fill rule (the one exception to non-zero): resolves overlapping or self-crossing contours.
export function unionByFillRule(rings: Ring[], fillRule: "nonzero" | "evenodd"): Ring[] {
  const rule = fillRule === "evenodd" ? FillRule.EvenOdd : FillRule.NonZero;
  return toRings(booleanOpD(ClipType.Union, toPaths(rings), null, rule, PRECISION));
}
