import test from "node:test";
import assert from "node:assert/strict";
import { distanceToRing, pointInRing, ringsBounds } from "../../../src/core/geometry/ringMath.ts";
import { baseOpeningArea, defaultDims, frame, isSimpleRing, nameFont } from "./helpers.ts";

const NAMES = ["The Sanders", "Montgomerys", "Los Muñoz", "The Sándérs"];
const { R, rin, yLine } = defaultDims();
const BUFFER = 3;

for (const name of NAMES) {
  const g = frame(name, "2026");

  test(`${name}: outer and backer are the same exact circle (AC2, AC6)`, () => {
    assert.deepEqual(g.outer, { cx: 0, cy: 0, r: R });
    assert.deepEqual(g.backer, g.outer);
  });

  test(`${name}: inner cut is one simple ring inside the inner disc (AC3)`, () => {
    assert.ok(g.innerCut.length >= 3);
    assert.ok(isSimpleRing(g.innerCut), "inner cut self-intersects");
    for (const p of g.innerCut) assert.ok(Math.hypot(p.x, p.y) <= rin + 0.01, `point outside inner disc: ${p.x},${p.y}`);
    assert.ok(g.usableOpening.areaMm2 > 0);
    assert.ok(g.usableOpening.areaMm2 < baseOpeningArea(rin, yLine));
    assert.deepEqual(g.usableOpening.polygon, g.innerCut);
    assert.deepEqual(g.warnings, []);
  });

  test(`${name}: engraving stays in the wood, buffered from the cut (AC4)`, () => {
    assert.ok(g.engraving.name.length > 0);
    assert.ok(g.engraving.year.length > 0);
    for (const ring of [...g.engraving.name, ...g.engraving.year]) {
      for (const p of ring) {
        assert.ok(!pointInRing(p, g.innerCut), `engraving point in opening: ${p.x},${p.y}`);
        assert.ok(distanceToRing(p, g.innerCut) >= BUFFER - 0.05, `engraving too close to cut: ${p.x},${p.y}`);
      }
    }
  });

  test(`${name}: cut does not dip between letters at default smoothness (AC5)`, () => {
    const xHeight = -nameFont.outline("x", 30).bounds.minY;
    const y = yLine - 0.25 * xHeight;
    const b = ringsBounds(g.engraving.name);
    for (let x = b.minX + 0.5; x <= b.maxX - 0.5; x += 0.5) {
      assert.ok(!pointInRing({ x, y }, g.innerCut), `opening reaches down at x=${x.toFixed(1)}`);
    }
  });
}

test("year sits below the line and the name", () => {
  const g = frame("The Sanders", "2026");
  const name = ringsBounds(g.engraving.name);
  const year = ringsBounds(g.engraving.year);
  assert.ok(year.minY > Math.max(yLine, name.maxY));
  assert.ok(Math.abs((year.minX + year.maxX) / 2) < 1e-9);
});

test("corner radius 0 keeps sharp corners; 20 rounds them (AC3a)", () => {
  const cx = Math.sqrt(rin * rin - yLine * yLine);
  const corners = [
    { x: cx, y: yLine },
    { x: -cx, y: yLine },
  ];
  const sharp = frame("The Sanders", "2026", { bottomCornerRadiusMm: 0 });
  const round = frame("The Sanders", "2026", { bottomCornerRadiusMm: 20 });
  for (const c of corners) {
    const nearest = Math.min(...sharp.innerCut.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
    assert.ok(nearest <= 0.05, `no vertex at sharp corner (${nearest})`);
    // A 20 mm fillet in this ~135 degree corner sits ~1.8 mm from the sharp corner point.
    const roundNearest = Math.min(...round.innerCut.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
    assert.ok(roundNearest > 1.5, `rounded corner too close (${roundNearest})`);
  }
});

test("looser smoothness gives a smaller opening (AC5)", () => {
  const close = frame("The Sanders", "2026", { contourSmoothness: 0 });
  const loose = frame("The Sanders", "2026", { contourSmoothness: 1 });
  assert.ok(loose.usableOpening.areaMm2 < close.usableOpening.areaMm2);
});

test("same input gives identical geometry (AC10)", () => {
  assert.deepEqual(frame("The Sándérs", "2026"), frame("The Sándérs", "2026"));
});

test("a very long name warns name-too-wide", () => {
  const g = frame("The Montgomery-Wellingtons", "2026");
  assert.ok(g.warnings.some((w) => w.code === "name-too-wide"));
  assert.ok(isSimpleRing(g.innerCut));
});

test("a missing glyph warns and skips the text without throwing", () => {
  const g = frame("日本", "2026");
  assert.deepEqual(
    g.warnings.map((w) => w.code),
    ["missing-glyph"],
  );
  assert.equal(g.engraving.name.length, 0);
  assert.ok(g.engraving.year.length > 0);
});

test("empty or blank name gives no name rings and no warnings", () => {
  for (const name of ["", "   "]) {
    const g = frame(name, "2026");
    assert.equal(g.engraving.name.length, 0);
    assert.deepEqual(g.warnings, []);
    assert.ok(Math.abs(g.usableOpening.areaMm2 - baseOpeningArea(rin, yLine)) < 600);
  }
});

test("missing year gives no year rings", () => {
  assert.equal(frame("The Sanders").engraving.year.length, 0);
  assert.equal(frame("The Sanders", "  ").engraving.year.length, 0);
});

test("a year too close to the edge warns year-does-not-fit", () => {
  const g = frame("The Sanders", "2026", { yearFontSizeMm: 70 });
  assert.ok(g.warnings.some((w) => w.code === "year-does-not-fit"));
});

test("nonsensical settings are clamped instead of throwing", () => {
  const cases = [
    { ringWidthMm: 400 },
    { bottomLineHeightMm: 500 },
    { bottomLineHeightMm: -10 },
    { bottomCornerRadiusMm: 1000 },
    { outerDiameterMm: 0 },
    { contourSmoothness: 5, nameBufferMm: -2 },
  ];
  for (const overrides of cases) {
    const g = frame("The Sanders", "2026", overrides);
    assert.ok(g.innerCut.length >= 3, JSON.stringify(overrides));
    assert.ok(isSimpleRing(g.innerCut), JSON.stringify(overrides));
    for (const p of g.innerCut) assert.ok(Math.hypot(p.x, p.y) < g.outer.r, JSON.stringify(overrides));
  }
});
