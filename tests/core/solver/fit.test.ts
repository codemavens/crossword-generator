import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFit, gridOriginMm, openingForSolver } from "../../../src/core/solver/index.ts";
import type { SolverOpening } from "../../../src/core/solver/index.ts";
import { layoutCells } from "../../../src/core/solver/grid.ts";
import { normalizeNames } from "../../../src/core/solver/normalize.ts";
import { distanceToRing, pointInRing } from "../../../src/core/geometry/ringMath.ts";
import type { CrosswordLayout } from "../../../src/core/models/project.ts";
import { frame } from "../geometry/helpers.ts";
import { TEN_NAMES, circleOpening, entries, run } from "./helpers.ts";

const AB = entries(["AB", "BA"]);
// AB across row 0 alone would be one name; here BA crosses it so the layout is a valid 2×2 L.
const L_LAYOUT: CrosswordLayout = {
  id: "t",
  seed: 0,
  decorativeTiles: [],
  offset: { xMm: 0, yMm: 0 },
  placements: [
    { nameId: "n0", start: { x: 0, y: 0 }, direction: "horizontal" },
    { nameId: "n1", start: { x: 1, y: 0 }, direction: "vertical" },
  ],
};

function square(half: number, tileSizeMm = 10, clearance = 0): SolverOpening {
  const polygon = [
    { x: -half, y: -half },
    { x: half, y: -half },
    { x: half, y: half },
    { x: -half, y: half },
  ];
  return { polygon, centroid: { x: 0, y: 0 }, clearance, tileSizeMm };
}

test("the bounding rectangle is centred on the centroid and clearance is respected", () => {
  // The 2×2 block spans [-1, 1] on both axes; the square opening's edge is at ±2.
  assert.equal(checkFit(L_LAYOUT, AB, square(2, 10, 0)).fits, true);
  assert.equal(checkFit(L_LAYOUT, AB, square(2, 10, 0.9)).fits, true);
  const tight = checkFit(L_LAYOUT, AB, square(2, 10, 1.1));
  assert.equal(tight.fits, false);
  assert.equal(tight.tilesOutside.length, 3);
});

test("the layout offset moves the crossword before the fit test", () => {
  assert.equal(checkFit({ ...L_LAYOUT, offset: { xMm: 5, yMm: 0 } }, AB, square(2, 10, 0)).fits, true);
  const moved = checkFit({ ...L_LAYOUT, offset: { xMm: 15, yMm: 0 } }, AB, square(2, 10, 0));
  assert.equal(moved.fits, false);
  assert.deepEqual(moved.tilesOutside, [{ x: 1, y: 0 }, { x: 1, y: 1 }]);
});

test("an empty opening fits nothing", () => {
  const empty: SolverOpening = { polygon: [], centroid: { x: 0, y: 0 }, clearance: 0, tileSizeMm: 10 };
  const fit = checkFit(L_LAYOUT, AB, empty);
  assert.equal(fit.fits, false);
  assert.equal(fit.tilesOutside.length, 3);
  const { result } = run(["ANNA", "BEN"], { opening: empty });
  for (const l of result.layouts) assert.equal(l.score.breakdown.circularFit, 0);
});

test("a large circle fits and a small circle does not, but layouts are still returned", () => {
  const big = run(TEN_NAMES, { opening: circleOpening(20, 0.4) }).result;
  assert.ok(big.layouts.length > 0);
  for (const l of big.layouts) {
    assert.equal(l.fit?.fits, true);
    assert.deepEqual(l.issues, []);
  }
  const { names, result } = run(TEN_NAMES, { opening: circleOpening(3, 0.4) });
  assert.ok(result.layouts.length > 0);
  for (const l of result.layouts) {
    assert.equal(l.fit?.fits, false);
    assert.ok(l.fit!.tilesOutside.length > 0);
    assert.ok(l.score.breakdown.circularFit < big.layouts[0]!.score.breakdown.circularFit);
    assert.deepEqual(l.issues.map((i) => [i.code, i.severity]), [["exceeds-opening", "warning"]]);
    assert.deepEqual(checkFit(l.layout, names, circleOpening(3, 0.4)), l.fit);
  }
});

test("fit against the real frame opening agrees with an independent millimetre check", () => {
  const geometry = frame("Sanders", "2026");
  const tileSizeMm = 12.7;
  const clearanceMm = 5;
  const opening = openingForSolver(geometry.usableOpening, tileSizeMm, clearanceMm);
  assert.ok(Math.abs(opening.clearance - clearanceMm / tileSizeMm) < 1e-12);
  const ring = geometry.usableOpening.polygon;

  let fitting = 0;
  for (const mode of ["quick", "balanced"] as const) {
    const { names, result } = run(TEN_NAMES, { mode, opening });
    assert.ok(result.layouts.length > 0);
    for (const l of result.layouts) {
      assert.deepEqual(checkFit(l.layout, names, opening), l.fit);
      const origin = gridOriginMm(l.layout, names, geometry.usableOpening.centroid, tileSizeMm);
      const outside = new Set(l.fit!.tilesOutside.map((c) => `${c.x},${c.y}`));
      if (l.fit!.fits) fitting++;
      for (const cell of layoutCells(normalizeNames(names).names, l.layout)) {
        const x0 = origin.x + cell.x * tileSizeMm;
        const y0 = origin.y + cell.y * tileSizeMm;
        const samples = [];
        for (let i = 0; i <= 8; i++) {
          const t = (i / 8) * tileSizeMm;
          samples.push({ x: x0 + t, y: y0 }, { x: x0 + t, y: y0 + tileSizeMm }, { x: x0, y: y0 + t }, { x: x0 + tileSizeMm, y: y0 + t });
        }
        const worst = Math.min(...samples.map((p) => (pointInRing(p, ring) ? distanceToRing(p, ring) : -1)));
        if (outside.has(`${cell.x},${cell.y}`)) {
          // Sampling can miss an edge vertex between samples, so allow a small tolerance.
          assert.ok(worst < clearanceMm + 0.5, `cell ${cell.x},${cell.y} marked outside but ${worst.toFixed(2)} mm clear`);
        } else {
          assert.ok(worst >= clearanceMm - 1e-6, `cell ${cell.x},${cell.y} marked inside but only ${worst.toFixed(2)} mm clear`);
        }
      }
    }
  }
  // The default 300 mm frame holds ten names comfortably at 12.7 mm tiles.
  assert.ok(fitting > 0);
});

test("gridOriginMm puts the bounding rectangle's centre on the centroid plus offset", () => {
  const origin = gridOriginMm({ ...L_LAYOUT, offset: { xMm: 3, yMm: -4 } }, AB, { x: 10, y: 20 }, 10);
  // 2×2 block: centre is origin + (10, 10) mm.
  assert.deepEqual({ x: origin.x + 10, y: origin.y + 10 }, { x: 13, y: 16 });
});
