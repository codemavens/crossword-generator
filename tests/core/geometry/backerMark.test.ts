import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKER_MARK_TOO_LARGE_MESSAGE, buildBackerMark, backerMarkInsetOk } from "../../../src/core/geometry/backerMark.ts";
import { signedArea } from "../../../src/core/geometry/polygonOps.ts";
import type { Point, Ring } from "../../../src/core/geometry/types.ts";

// Clockwise on screen (positive area), as the crossword's outer ring; holes use reversed order.
const rect = (x: number, y: number, w: number, h: number): Ring => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const hole = (x: number, y: number, w: number, h: number): Ring => rect(x, y, w, h).reverse();

function bbox(ring: Ring): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-3;
const has = (ring: Ring, p: Point): boolean => ring.some((q) => near(q.x, p.x) && near(q.y, p.y));

test("a 5 x 3 mm rectangle at 1 mm gives a 3 x 1 mm rectangle, 1 mm in from every side", () => {
  const mark = buildBackerMark({ outer: rect(10, 20, 5, 3), holes: [] }, 1);
  assert.equal(mark.problem, null);
  assert.equal(mark.rings.length, 1);
  const b = bbox(mark.rings[0]!);
  assert.deepEqual([b.minX, b.minY, b.maxX, b.maxY].map((n) => Math.round(n * 1000) / 1000), [11, 21, 14, 22]);
  assert.equal(mark.rings[0]!.length, 4);
  assert.ok(near(signedArea(mark.rings[0]!), 3));
});

test("an L-shape keeps square corners and moves every edge in by the inset", () => {
  // 6 x 6 with the top-right 3 x 3 removed.
  const outer: Ring = [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 3, y: 3 },
    { x: 6, y: 3 },
    { x: 6, y: 6 },
    { x: 0, y: 6 },
  ];
  const mark = buildBackerMark({ outer, holes: [] }, 0.5);
  assert.equal(mark.problem, null);
  assert.equal(mark.rings.length, 1);
  const ring = mark.rings[0]!;
  assert.equal(ring.length, 6);
  for (const p of [{ x: 0.5, y: 0.5 }, { x: 2.5, y: 0.5 }, { x: 2.5, y: 3.5 }, { x: 5.5, y: 3.5 }, { x: 5.5, y: 5.5 }, { x: 0.5, y: 5.5 }]) {
    assert.ok(has(ring, p), `missing corner ${p.x},${p.y}`);
  }
});

test("a hole is marked larger than the hole by the inset on every side", () => {
  const mark = buildBackerMark({ outer: rect(0, 0, 9, 9), holes: [hole(3, 3, 3, 3)] }, 1);
  assert.equal(mark.problem, null);
  assert.equal(mark.rings.length, 2);
  const outer = mark.rings.find((r) => signedArea(r) > 0)!;
  const inner = mark.rings.find((r) => signedArea(r) < 0)!;
  assert.deepEqual(bbox(outer), { minX: 1, minY: 1, maxX: 8, maxY: 8 });
  assert.deepEqual(
    Object.values(bbox(inner)).map((n) => Math.round(n * 1000) / 1000),
    [2, 2, 7, 7],
  );
});

test("a different inset moves the mark accordingly", () => {
  const cut = { outer: rect(0, 0, 10, 10), holes: [] };
  for (const inset of [0.1, 0.5, 1.5, 2]) {
    const mark = buildBackerMark(cut, inset);
    const b = bbox(mark.rings[0]!);
    assert.ok(near(b.minX, inset) && near(b.maxX, 10 - inset), `inset ${inset}`);
  }
});

test("an inset that collapses the shape gives a problem and no rings", () => {
  const mark = buildBackerMark({ outer: rect(0, 0, 5, 3), holes: [] }, 2);
  assert.deepEqual(mark.rings, []);
  assert.equal(mark.problem, BACKER_MARK_TOO_LARGE_MESSAGE);
});

test("an inset that splits the shape or merges a hole into the edge gives a problem", () => {
  // Dumbbell: two 6 x 6 blocks joined by a 2 mm wide neck.
  const dumbbell: Ring = [
    { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 0 }, { x: 14, y: 0 },
    { x: 14, y: 6 }, { x: 8, y: 6 }, { x: 8, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 0, y: 6 },
  ];
  assert.equal(buildBackerMark({ outer: dumbbell, holes: [] }, 1.5).problem, BACKER_MARK_TOO_LARGE_MESSAGE);
  assert.equal(buildBackerMark({ outer: dumbbell, holes: [] }, 0.5).problem, null);
  // The hole grows into the outer edge.
  const merged = buildBackerMark({ outer: rect(0, 0, 6, 6), holes: [hole(1.5, 1.5, 2, 2)] }, 1);
  assert.equal(merged.problem, BACKER_MARK_TOO_LARGE_MESSAGE);
});

test("an arm too thin to survive the inset is reported even though one ring remains", () => {
  // 10 x 10 block with a 1 mm wide, 3 mm long arm.
  const arm: Ring = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 13, y: 4 }, { x: 13, y: 5 }, { x: 10, y: 5 },
    { x: 10, y: 10 }, { x: 0, y: 10 },
  ];
  assert.equal(buildBackerMark({ outer: arm, holes: [] }, 1).problem, BACKER_MARK_TOO_LARGE_MESSAGE);
});

test("a hole touching the edge at one corner is still marked, merged into the outline", () => {
  // 9 x 9 block whose 3 x 3 hole shares only the corner point (3, 6) with a notch in the edge.
  const outer: Ring = [
    { x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 9 }, { x: 3, y: 9 }, { x: 3, y: 6 }, { x: 0, y: 6 },
  ];
  const mark = buildBackerMark({ outer, holes: [hole(0, 3, 3, 3)] }, 0.5);
  assert.equal(mark.problem, null);
  assert.ok(mark.rings.length >= 1);
});

test("no outline means no mark and no problem", () => {
  assert.deepEqual(buildBackerMark({ outer: [], holes: [] }, 1), { rings: [], problem: null });
});

test("the inset limits are 0.1 to 2 mm inclusive and finite", () => {
  for (const ok of [0.1, 1, 2]) assert.ok(backerMarkInsetOk(ok), String(ok));
  for (const bad of [0, 0.09, 2.01, -1, NaN, Infinity, "1", null, undefined]) assert.equal(backerMarkInsetOk(bad), false, String(bad));
});
