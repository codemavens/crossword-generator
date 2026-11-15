import { test } from "node:test";
import assert from "node:assert/strict";
import {
  centredLayout,
  largestTileSizeThatFits,
  minimumValidDiameter,
  movedLayout,
  smallestDiameterThatFits,
} from "../../src/core/sizing/index.ts";
import { checkFit, openingForSolver } from "../../src/core/solver/index.ts";
import { buildFrameGeometry } from "../../src/core/geometry/frame.ts";
import { defaultFrameSettings } from "../../src/core/models/defaults.ts";
import { frameCrossFieldProblems } from "../../src/core/models/validation.ts";
import type { CrosswordLayout, FrameSettings } from "../../src/core/models/project.ts";
import { nameFont, yearFont } from "./geometry/helpers.ts";
import { TEN_NAMES, entries, run } from "./solver/helpers.ts";
import { validateLayout } from "../../src/core/solver/index.ts";

const { names, layout } = (() => {
  const { names, result } = run(TEN_NAMES);
  return { names, layout: result.layouts[0]!.layout };
})();
const FRAME = defaultFrameSettings();
const geometry = (settings: FrameSettings = FRAME) =>
  buildFrameGeometry({ familyName: "The Sanders", year: "2026", settings, nameFont, yearFont });
const g300 = geometry();

function tileFits(l: CrosswordLayout, size: number, clearance = FRAME.crosswordClearanceMm): boolean {
  return checkFit(l, names, openingForSolver(g300.usableOpening, size, clearance)).fits;
}

function diameterFits(l: CrosswordLayout, d: number, tileSizeMm: number): boolean {
  const g = geometry({ ...FRAME, outerDiameterMm: d });
  return checkFit(l, names, openingForSolver(g.usableOpening, tileSizeMm, FRAME.crosswordClearanceMm)).fits;
}

const tileQuery = (l: CrosswordLayout, over: Partial<Parameters<typeof largestTileSizeThatFits>[0]> = {}) => ({
  names,
  layout: l,
  opening: g300.usableOpening,
  clearanceMm: FRAME.crosswordClearanceMm,
  min: 1,
  max: 200,
  ...over,
});

const diameterQuery = (l: CrosswordLayout, tileSizeMm: number, over: Partial<Parameters<typeof smallestDiameterThatFits>[0]> = {}) => ({
  familyName: "The Sanders",
  year: "2026",
  frame: FRAME,
  nameFont,
  yearFont,
  names,
  layout: l,
  tileSizeMm,
  min: 20,
  max: 2000,
  ...over,
});

test("largest tile size fits, and 0.1 mm larger does not", () => {
  const size = largestTileSizeThatFits(tileQuery(layout));
  assert.ok(size !== null);
  assert.equal(Math.round(size * 10) / 10, size, "rounded to 0.1 mm");
  assert.ok(tileFits(layout, size));
  assert.ok(!tileFits(layout, Math.round((size + 0.1) * 10) / 10));
});

test("largest tile size respects a non-zero offset", () => {
  const moved = movedLayout(layout, 25, -15);
  const centred = largestTileSizeThatFits(tileQuery(layout))!;
  const size = largestTileSizeThatFits(tileQuery(moved));
  assert.ok(size !== null);
  assert.ok(size <= centred + 1e-9);
  assert.ok(tileFits(moved, size));
  assert.ok(!tileFits(moved, Math.round((size + 0.1) * 10) / 10));
});

test("largest tile size is null when nothing in range fits, and is deterministic", () => {
  assert.equal(largestTileSizeThatFits(tileQuery(layout, { min: 100, max: 200 })), null);
  assert.equal(largestTileSizeThatFits(tileQuery(movedLayout(layout, 2000, 0))), null);
  assert.equal(largestTileSizeThatFits(tileQuery(layout)), largestTileSizeThatFits(tileQuery(layout)));
});

test("largest tile size is capped by max", () => {
  assert.equal(largestTileSizeThatFits(tileQuery(layout, { max: 5 })), 5);
});

test("smallest diameter fits, and 1 mm smaller does not", () => {
  const started = performance.now();
  const d = smallestDiameterThatFits(diameterQuery(layout, 12.7));
  const elapsed = performance.now() - started;
  assert.ok(d !== null);
  assert.ok(Number.isInteger(d));
  assert.ok(diameterFits(layout, d, 12.7));
  assert.ok(!diameterFits(layout, d - 1, 12.7));
  assert.ok(elapsed < 1000, `took ${elapsed.toFixed(0)} ms`);
});

test("smallest diameter respects a non-zero offset", () => {
  const moved = movedLayout(layout, 0, -20);
  const d = smallestDiameterThatFits(diameterQuery(moved, 12.7));
  assert.ok(d !== null);
  assert.ok(diameterFits(moved, d, 12.7));
  assert.ok(!diameterFits(moved, d - 1, 12.7));
});

test("smallest diameter is null when nothing in range fits", () => {
  assert.equal(smallestDiameterThatFits(diameterQuery(layout, 12.7, { max: 150 })), null);
  assert.equal(smallestDiameterThatFits(diameterQuery(layout, 150, { max: 1000 })), null);
  // Probed, but moved so far up that no diameter in range leaves room above.
  assert.equal(smallestDiameterThatFits(diameterQuery(movedLayout(layout, 0, -700), 12.7, { max: 1000 })), null);
});

test("smallest diameter never breaks the frame's own rules", () => {
  const frame = { ...FRAME, ringWidthMm: 30, bottomLineHeightMm: 60 };
  const min = minimumValidDiameter(frame);
  assert.equal(min, 180);
  assert.deepEqual(frameCrossFieldProblems({ ...frame, outerDiameterMm: min }), []);
  assert.ok(frameCrossFieldProblems({ ...frame, outerDiameterMm: min - 1 }).length > 0);
  const d = smallestDiameterThatFits(diameterQuery(layout, 2, { frame }));
  assert.ok(d !== null && d >= min);
});

test("moving and centring change only the offset", () => {
  const moved = movedLayout(layout, 1.234, -5.06);
  assert.deepEqual(moved.offset, { xMm: 1.2, yMm: -5.1 });
  assert.equal(moved.placements, layout.placements);
  assert.equal(movedLayout(moved, 0, 0), moved);
  assert.deepEqual(movedLayout(layout, 1e9, -1e9).offset, { xMm: 10000, yMm: -10000 });
  assert.deepEqual(centredLayout(moved).offset, { xMm: 0, yMm: 0 });
  assert.equal(centredLayout(layout), layout);
});

// A U-shaped crossword around a tall family name "I": fits at 21 mm but not at 1 mm (fit is not monotonic).
const U_NAMES = entries(["ANNA", "ALICE", "AMBER"]);
const U_LAYOUT: CrosswordLayout = {
  id: "u",
  seed: 0,
  decorativeTiles: [],
  offset: { xMm: 0, yMm: 56 },
  placements: [
    { nameId: "n0", start: { x: 0, y: 0 }, direction: "horizontal" },
    { nameId: "n1", start: { x: 0, y: 0 }, direction: "vertical" },
    { nameId: "n2", start: { x: 3, y: 0 }, direction: "vertical" },
  ],
};
const U_FRAME: FrameSettings = { ...FRAME, familyNameFontSizeMm: 100, contourSmoothness: 0 };
const uGeometry = (settings: FrameSettings = U_FRAME) =>
  buildFrameGeometry({ familyName: "I", settings, nameFont: yearFont, yearFont });
const uFits = (size: number, settings: FrameSettings = U_FRAME) =>
  checkFit(U_LAYOUT, U_NAMES, openingForSolver(uGeometry(settings).usableOpening, size, settings.crosswordClearanceMm)).fits;

test("largest tile size: a crossword wrapped around the name contour (non-monotonic fit)", () => {
  assert.deepEqual(validateLayout(U_NAMES, U_LAYOUT).filter((i) => i.severity === "error"), []);
  assert.ok(uFits(21));
  assert.ok(!uFits(1));
  const started = performance.now();
  const size = largestTileSizeThatFits({
    names: U_NAMES,
    layout: U_LAYOUT,
    opening: uGeometry().usableOpening,
    clearanceMm: U_FRAME.crosswordClearanceMm,
    min: 1,
    max: 200,
  });
  const elapsed = performance.now() - started;
  assert.ok(size !== null && size >= 21, `got ${String(size)}`);
  assert.ok(uFits(size));
  assert.ok(!uFits(Math.round((size + 0.1) * 10) / 10));
  assert.ok(elapsed < 500, `took ${elapsed.toFixed(0)} ms`);
});

test("smallest diameter: the result fits for the wrapped crossword", () => {
  const size = 21;
  const d = smallestDiameterThatFits({
    familyName: "I",
    frame: U_FRAME,
    nameFont: yearFont,
    yearFont,
    names: U_NAMES,
    layout: U_LAYOUT,
    tileSizeMm: size,
    min: 20,
    max: 2000,
  });
  assert.ok(d !== null && d <= U_FRAME.outerDiameterMm, `got ${String(d)}`);
  assert.ok(uFits(size, { ...U_FRAME, outerDiameterMm: d }));
  assert.ok(!uFits(size, { ...U_FRAME, outerDiameterMm: d - 1 }));
});

test("worst case (nothing fits) stays fast", () => {
  let started = performance.now();
  assert.equal(largestTileSizeThatFits(tileQuery(movedLayout(layout, 0, -1000), { min: 0.1 })), null);
  const tileMs = performance.now() - started;
  started = performance.now();
  assert.equal(smallestDiameterThatFits(diameterQuery(movedLayout(layout, 0, -1500), 12.7)), null);
  const diameterMs = performance.now() - started;
  console.log(`worst case: tile ${tileMs.toFixed(0)} ms, diameter ${diameterMs.toFixed(0)} ms`);
  assert.ok(tileMs < 1000 && diameterMs < 2000, `tile ${tileMs.toFixed(0)} ms, diameter ${diameterMs.toFixed(0)} ms`);
});
