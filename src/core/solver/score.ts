// Layout scoring (SPEC §8). Every metric is in [0, 1]; formulas are first guesses, to be tuned by eye.
import type { GridPosition, SolverWeights } from "../models/project.ts";
import type { FitChecker } from "./fit.ts";
import type { FitResult, LayoutBounds, ScoreBreakdown } from "./types.ts";

export const WEIGHT_KEYS: (keyof SolverWeights)[] = [
  "circularFit",
  "compactness",
  "visualBalance",
  "naturalIntersections",
  "fewConnectors",
];

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

// Negative or non-finite weights count as 0.
export function sanitizeWeights(weights: Partial<SolverWeights> | undefined): SolverWeights {
  const out = {} as SolverWeights;
  for (const key of WEIGHT_KEYS) {
    const v = weights?.[key];
    out[key] = typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
  }
  return out;
}

export function weightSum(weights: SolverWeights): number {
  return WEIGHT_KEYS.reduce((sum, k) => sum + weights[k], 0);
}

// sum(w·m) / sum(w); 0 when every weight is 0 (the fixed ranking then applies).
export function combineScore(breakdown: ScoreBreakdown, weights: SolverWeights): number {
  const total = weightSum(weights);
  if (total === 0) return 0;
  return WEIGHT_KEYS.reduce((sum, k) => sum + weights[k] * breakdown[k], 0) / total;
}

export interface MetricInput {
  cells: readonly GridPosition[];
  bounds: LayoutBounds;
  intersectionCount: number;
  connectorCount: number;
  nameCount: number;
  fit: FitResult | null;
  checker: FitChecker | null;
}

// circularFit: (tiles inside)² × (1 − ½·farthest tile corner from the centre / effective opening radius); 0 without an opening.
export function circularFitMetric(input: MetricInput): number {
  const { fit, checker, cells, bounds } = input;
  if (!fit || !checker || checker.empty || cells.length === 0) return 0;
  const insideFraction = 1 - fit.tilesOutside.length / cells.length;
  const cx = bounds.minX + bounds.width / 2;
  const cy = bounds.minY + bounds.height / 2;
  let reach = 0;
  for (const c of cells) {
    const dx = Math.max(Math.abs(c.x - cx), Math.abs(c.x + 1 - cx));
    const dy = Math.max(Math.abs(c.y - cy), Math.abs(c.y + 1 - cy));
    reach = Math.max(reach, Math.hypot(dx, dy));
  }
  return clamp01(insideFraction * insideFraction * (1 - 0.5 * clamp01(reach / checker.effectiveRadius)));
}

// compactness: 0.6 × occupied share of the bounding rectangle + 0.4 × short side / long side.
export function compactnessMetric(cells: number, width: number, height: number): number {
  if (cells === 0) return 0;
  return clamp01((0.6 * cells) / (width * height) + (0.4 * Math.min(width, height)) / Math.max(width, height));
}

// visualBalance: 1 − 0.6 × centre-of-mass offset from the rectangle centre (normalised) − 0.4 × quadrant imbalance.
export function visualBalanceMetric(cells: readonly GridPosition[], bounds: LayoutBounds): number {
  if (cells.length === 0) return 0;
  const cx = bounds.minX + bounds.width / 2;
  const cy = bounds.minY + bounds.height / 2;
  let sx = 0;
  let sy = 0;
  const quadrants = [0, 0, 0, 0];
  for (const c of cells) {
    const dx = c.x + 0.5 - cx;
    const dy = c.y + 0.5 - cy;
    sx += dx;
    sy += dy;
    // A tile on a centre line is shared between the quadrants it touches.
    const xs = dx === 0 ? [0, 1] : dx < 0 ? [0] : [1];
    const ys = dy === 0 ? [0, 2] : dy < 0 ? [0] : [2];
    const share = 1 / (xs.length * ys.length);
    for (const qx of xs) for (const qy of ys) quadrants[qx + qy]! += share;
  }
  const n = cells.length;
  const comOffset = Math.hypot(sx / n / (bounds.width / 2), sy / n / (bounds.height / 2)) / Math.SQRT2;
  const spread = (Math.max(...quadrants) - Math.min(...quadrants)) / n;
  return clamp01(1 - 0.6 * clamp01(comOffset) - 0.4 * spread);
}

// naturalIntersections: crossings / (2 × (names − 1)), capped at 1; a bare tree scores 0.5.
export function naturalIntersectionsMetric(intersections: number, names: number): number {
  if (names <= 1) return 1;
  return clamp01(intersections / (2 * (names - 1)));
}

// fewConnectors: 1 / (1 + automatic connectors); always 1 until connectors exist.
export function fewConnectorsMetric(connectors: number): number {
  return 1 / (1 + Math.max(0, connectors));
}

export function computeMetrics(input: MetricInput): ScoreBreakdown {
  return {
    circularFit: circularFitMetric(input),
    compactness: compactnessMetric(input.cells.length, input.bounds.width, input.bounds.height),
    visualBalance: visualBalanceMetric(input.cells, input.bounds),
    naturalIntersections: naturalIntersectionsMetric(input.intersectionCount, input.nameCount),
    fewConnectors: fewConnectorsMetric(input.connectorCount),
  };
}

export interface Rankable {
  total: number;
  intersectionCount: number;
  area: number;
  order: number;
}

// Higher total first; then (and alone when all weights are 0) most crossings, smallest bounding area, discovery order.
export function compareRankable(a: Rankable, b: Rankable, useTotal: boolean): number {
  if (useTotal && a.total !== b.total) return b.total - a.total;
  if (a.intersectionCount !== b.intersectionCount) return b.intersectionCount - a.intersectionCount;
  if (a.area !== b.area) return a.area - b.area;
  return a.order - b.order;
}
