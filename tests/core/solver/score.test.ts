import { test } from "node:test";
import assert from "node:assert/strict";
import { WEIGHT_KEYS, combineScore, rankLayouts, sanitizeWeights } from "../../../src/core/solver/index.ts";
import {
  compactnessMetric,
  fewConnectorsMetric,
  naturalIntersectionsMetric,
  visualBalanceMetric,
} from "../../../src/core/solver/score.ts";
import { cellsBounds } from "../../../src/core/solver/grid.ts";
import { DEFAULT_SOLVER_WEIGHTS } from "../../../src/core/models/defaults.ts";
import type { SolverWeights } from "../../../src/core/models/project.ts";
import { TEN_NAMES, circleOpening, run } from "./helpers.ts";

const ZERO: SolverWeights = { circularFit: 0, compactness: 0, visualBalance: 0, naturalIntersections: 0, fewConnectors: 0 };

test("each metric is between 0 and 1 and the total is the weighted average", () => {
  const { result } = run(TEN_NAMES, { mode: "balanced", opening: circleOpening(12, 0.4) });
  const w = DEFAULT_SOLVER_WEIGHTS;
  for (const l of result.layouts) {
    assert.deepEqual(Object.keys(l.score.breakdown).sort(), [...WEIGHT_KEYS].sort());
    for (const key of WEIGHT_KEYS) {
      const m = l.score.breakdown[key];
      assert.ok(m >= 0 && m <= 1, `${key} = ${m}`);
    }
    const expected = WEIGHT_KEYS.reduce((s, k) => s + w[k] * l.score.breakdown[k], 0) / 165;
    assert.ok(Math.abs(l.score.total - expected) < 1e-12);
    assert.equal(l.score.breakdown.fewConnectors, 1);
    assert.ok(l.score.breakdown.circularFit > 0);
  }
  for (let i = 1; i < result.layouts.length; i++) {
    assert.ok(result.layouts[i - 1]!.score.total >= result.layouts[i]!.score.total);
  }
});

test("all weights zero use the fixed ranking: most crossings, then smallest area", () => {
  const { result } = run(TEN_NAMES, { mode: "balanced", weights: ZERO });
  assert.ok(result.layouts.length > 1);
  for (const l of result.layouts) assert.equal(l.score.total, 0);
  for (let i = 1; i < result.layouts.length; i++) {
    const a = result.layouts[i - 1]!;
    const b = result.layouts[i]!;
    const ok =
      a.intersectionCount > b.intersectionCount ||
      (a.intersectionCount === b.intersectionCount && a.bounds.width * a.bounds.height <= b.bounds.width * b.bounds.height);
    assert.ok(ok, `rank ${i} out of order`);
  }
});

test("negative and non-finite weights count as zero", () => {
  const weird = { circularFit: -5, compactness: Number.NaN, visualBalance: -1, naturalIntersections: Infinity, fewConnectors: -0 };
  assert.deepEqual(sanitizeWeights(weird), ZERO);
  assert.deepEqual(run(TEN_NAMES, { weights: weird }).result, run(TEN_NAMES, { weights: ZERO }).result);
});

test("a single weight ranks by that metric", () => {
  const only = { ...ZERO, compactness: 3 };
  const { result } = run(TEN_NAMES, { mode: "balanced", weights: only });
  for (const l of result.layouts) assert.equal(l.score.total, l.score.breakdown.compactness);
  for (let i = 1; i < result.layouts.length; i++) {
    assert.ok(result.layouts[i - 1]!.score.breakdown.compactness >= result.layouts[i]!.score.breakdown.compactness);
  }
});

test("rankLayouts re-ranks under new weights without searching", () => {
  const { result } = run(TEN_NAMES, { mode: "balanced" });
  const reranked = rankLayouts(result.layouts, { ...ZERO, visualBalance: 1 });
  assert.equal(reranked.length, result.layouts.length);
  for (let i = 1; i < reranked.length; i++) {
    assert.ok(reranked[i - 1]!.score.breakdown.visualBalance >= reranked[i]!.score.breakdown.visualBalance);
  }
  assert.equal(reranked[0]!.score.total, combineScore(reranked[0]!.score.breakdown, { ...ZERO, visualBalance: 1 }));
});

test("without an opening circular fit is 0 and fit is null", () => {
  const { result } = run(["ANNA", "BEN"]);
  for (const l of result.layouts) {
    assert.equal(l.fit, null);
    assert.equal(l.score.breakdown.circularFit, 0);
  }
});

test("metric formulas behave at their extremes", () => {
  assert.equal(compactnessMetric(9, 3, 3), 1);
  assert.ok(compactnessMetric(5, 5, 1) < compactnessMetric(5, 3, 3));
  assert.equal(naturalIntersectionsMetric(1, 2), 0.5);
  assert.equal(naturalIntersectionsMetric(4, 3), 1);
  assert.equal(fewConnectorsMetric(0), 1);
  assert.equal(fewConnectorsMetric(1), 0.5);
  const square = [0, 1, 2].flatMap((x) => [0, 1, 2].map((y) => ({ x, y })));
  assert.equal(visualBalanceMetric(square, cellsBounds(square)), 1);
  const lopsided = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 3, y: 3 }];
  assert.ok(visualBalanceMetric(lopsided, cellsBounds(lopsided)) < 1);
});
