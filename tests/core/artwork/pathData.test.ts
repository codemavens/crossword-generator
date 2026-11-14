import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arcToSegments,
  flattenSegments,
  parsePathData,
  segmentsBounds,
  serializeSegments,
  transformSegments,
} from "../../../src/core/artwork/pathData.ts";
import type { PathSegment } from "../../../src/core/artwork/pathData.ts";

function norm(d: string, decimals = 3): string {
  const r = parsePathData(d);
  assert.ok(r.ok, r.ok ? "" : r.message);
  return serializeSegments(r.segments, decimals);
}

function segs(d: string): PathSegment[] {
  const r = parsePathData(d);
  assert.ok(r.ok, r.ok ? "" : r.message);
  return r.segments;
}

function close(actual: number, expected: number, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} is not close to ${expected}`);
}

test("absolute and relative lines, H/V and close", () => {
  assert.equal(norm("M10 10 L20 10 L20 20 Z"), "M10 10L20 10L20 20Z");
  assert.equal(norm("m10 10 l10 0 0 10 z"), "M10 10L20 10L20 20Z");
  assert.equal(norm("M10 10h5v5H10V12z"), "M10 10L15 10L15 15L10 15L10 12Z");
  assert.equal(norm("M1 1h-2v-2"), "M1 1L-1 1L-1 -1");
});

test("implicit repeats: extra pairs after a move are line-tos", () => {
  assert.equal(norm("M0 0 10 0 10 10"), "M0 0L10 0L10 10");
  assert.equal(norm("m5 5 1 1 1 1"), "M5 5L6 6L7 7");
  assert.equal(norm("M0 0C1 1 2 2 3 3 4 4 5 5 6 6"), "M0 0C1 1 2 2 3 3C4 4 5 5 6 6");
});

test("a drawing command after Z starts again at the subpath start", () => {
  assert.equal(norm("M5 5 L10 5 L10 10 Z L0 0"), "M5 5L10 5L10 10ZM5 5L0 0");
  assert.equal(norm("M5 5 L10 5 z l1 1"), "M5 5L10 5ZM5 5L6 6");
});

test("numbers without separators, signs and exponents", () => {
  assert.equal(norm("M1.5.5L-1-2"), "M1.5 0.5L-1 -2");
  assert.equal(norm("M1e1,2E-1l.5.5"), "M10 0.2L10.5 0.7");
  assert.equal(norm("M+1 +2"), "M1 2");
});

test("quadratics become exact cubics, T reflects the previous control point", () => {
  assert.equal(norm("M0 0Q15 30 30 0"), "M0 0C10 20 20 20 30 0");
  assert.equal(norm("M0 0Q15 30 30 0T60 0"), "M0 0C10 20 20 20 30 0C40 -20 50 -20 60 0");
  // T without a preceding Q uses the current point as control: a straight cubic.
  assert.equal(norm("M0 0T30 0"), "M0 0C0 0 10 0 30 0");
  assert.equal(norm("m0 0q15 30 30 0t30 0"), "M0 0C10 20 20 20 30 0C40 -20 50 -20 60 0");
});

test("S reflects the previous cubic's second control point", () => {
  assert.equal(norm("M0 0C0 10 10 10 10 0S20 -10 20 0"), "M0 0C0 10 10 10 10 0C10 -10 20 -10 20 0");
  assert.equal(norm("M0 0S5 5 10 0"), "M0 0C0 0 5 5 10 0");
  assert.equal(norm("M0 0c0 10 10 10 10 0s10 -10 10 0"), "M0 0C0 10 10 10 10 0C10 -10 20 -10 20 0");
});

test("arcs become cubics through the right points", () => {
  // Quarter circle of radius 10 from (0,0) to (10,10) about (0,10); sweep 1 turns clockwise on screen.
  const quarter = segs("M0 0A10 10 0 0 1 10 10");
  assert.equal(quarter.length, 2);
  const c = quarter[1]!;
  assert.equal(c.type, "C");
  if (c.type === "C") {
    close(c.x, 10);
    close(c.y, 10);
    // The first control point lies on the start tangent.
    close(c.x1, 10 * 0.5522847498, 1e-6);
    close(c.y1, 0);
  }
  // Half circle splits into two quarter cubics; the midpoint is on the circle.
  const half = segs("M0 0A5 5 0 1 0 10 0");
  assert.equal(half.length, 3);
  const mid = half[1]!;
  if (mid.type === "C") {
    close(mid.x, 5);
    close(mid.y, 5);
  }
  const b = segmentsBounds(half)!;
  close(b.minX, 0);
  close(b.maxX, 10);
  close(b.minY, 0);
  close(b.maxY, 5, 1e-3);
});

test("arc flags packed without separators", () => {
  const packed = norm("M0 0a5 5 0 1010 0");
  assert.equal(packed, norm("M0 0 a 5 5 0 1 0 10 0"));
  assert.equal(norm("M0 0A5,5,0,1,1,10,0"), norm("M0 0A5 5 0 1 1 10 0"));
  assert.equal(norm("M0 0a5 5 0 0010 0"), norm("M0 0a5 5 0 0 0 10 0"));
});

test("arc edge cases: zero radius is a line, too-small radii are scaled up, same endpoints draw nothing", () => {
  assert.deepEqual(arcToSegments(0, 0, 0, 5, 0, false, true, 10, 0), [{ type: "L", x: 10, y: 0 }]);
  assert.deepEqual(arcToSegments(3, 3, 5, 5, 0, false, true, 3, 3), []);
  const scaled = segmentsBounds(segs("M0 0A1 1 0 0 1 10 0"))!;
  close(scaled.minY, -5, 1e-3);
});

test("rotated elliptical arc ends at the requested point", () => {
  const s = segs("M0 0A20 10 30 0 1 15 12");
  const last = s.at(-1)!;
  assert.ok(last.type === "C");
  if (last.type === "C") {
    assert.equal(last.x, 15);
    assert.equal(last.y, 12);
  }
});

test("transforms are applied to every point", () => {
  const moved = transformSegments(segs("M0 0L10 0C10 5 5 10 0 10Z"), { a: 2, b: 0, c: 0, d: 3, e: 1, f: -1 });
  assert.equal(serializeSegments(moved, 3), "M1 -1L21 -1C21 14 11 29 1 29Z");
  const rotated = transformSegments(segs("M10 0"), { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 });
  assert.equal(serializeSegments(rotated, 3), "M0 10");
});

test("cubic bounds use the true extrema, not the control points", () => {
  const b = segmentsBounds(segs("M0 0C0 40 40 40 40 0"))!;
  assert.equal(b.minY, 0);
  close(b.maxY, 30);
  assert.equal(b.maxX, 40);
});

test("flattening stays close to the curve and gives one ring per subpath", () => {
  const rings = flattenSegments(segs("M0 0C0 40 40 40 40 0ZM100 100L110 100L110 110Z"), 0.01);
  assert.equal(rings.length, 2);
  const curve = rings[0]!;
  const maxY = Math.max(...curve.map((p) => p.y));
  close(maxY, 30, 0.02);
  assert.deepEqual(rings[1], [
    { x: 100, y: 100 },
    { x: 110, y: 100 },
    { x: 110, y: 110 },
  ]);
});

test("malformed data is refused, not thrown", () => {
  for (const bad of ["", "L0 0", "M0", "M0 0 L", "M0 0 X5 5", "M0 0 A5 5 0 2 0 10 10", "10 10", "M0 0 Z 5 5", "M1e999 0", "M0 0 L1..", "M0 0 L 1e"]) {
    const r = parsePathData(bad);
    if (bad === "") {
      // Empty data parses to nothing; callers treat it as no drawing.
      assert.ok(r.ok && r.segments.length === 0);
      continue;
    }
    assert.equal(r.ok, false, bad);
  }
});

test("segment budget refuses overly detailed data", () => {
  const d = "M0 0" + "L1 1".repeat(50);
  assert.equal(parsePathData(d, { maxSegments: 20 }).ok, false);
  assert.equal(parsePathData(d, { maxSegments: 51 }).ok, true);
});

test("strict mode accepts only the stored grammar", () => {
  assert.ok(parsePathData("M0 0L10.5 -2C1 2 3 4 5 6Z", { strict: true }).ok);
  for (const bad of ["m0 0l1 1", "M0 0H5", "M0 0Q1 1 2 2", "M0 0A1 1 0 0 1 2 2", "M1e2 0", "M0 0L1.2345 0", "M+1 0", "M0\t0", "M0 0L1 1<script>"]) {
    assert.equal(parsePathData(bad, { strict: true }).ok, false, bad);
  }
});
