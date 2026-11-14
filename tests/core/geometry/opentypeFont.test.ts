import test from "node:test";
import assert from "node:assert/strict";
import { createFontOutliner } from "../../../src/core/typography/opentypeFont.ts";
import { nameFont, pacificoBytes } from "./helpers.ts";

test("outline has sane bounds and advance", () => {
  const o = nameFont.outline("The Sanders", 30);
  assert.ok(o.rings.length > 0);
  assert.ok(o.advanceMm > 0);
  assert.ok(o.bounds.minY < -15 && o.bounds.minY > -40, `cap top ${o.bounds.minY}`);
  assert.ok(o.bounds.maxY > -1 && o.bounds.maxY < 15, `bottom ${o.bounds.maxY}`);
  assert.ok(o.bounds.minX >= -5 && o.bounds.maxX > 100);
  for (const ring of o.rings) assert.ok(ring.length >= 3);
});

test("curves are flattened finely", () => {
  const o = nameFont.outline("o", 30);
  for (const ring of o.rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      assert.ok(Math.hypot(b.x - a.x, b.y - a.y) < 5);
    }
  }
});

test("composed and decomposed text give the same outline", () => {
  assert.deepEqual(nameFont.outline("André", 20), nameFont.outline("André", 20));
  assert.ok(nameFont.hasGlyphs("André"));
});

test("missing glyph throws in outline and is reported by hasGlyphs", () => {
  assert.equal(nameFont.hasGlyphs("日"), false);
  assert.equal(nameFont.hasGlyphs("The Sanders"), true);
  assert.throws(() => nameFont.outline("A日", 20));
});

test("a fresh outliner gives identical output", () => {
  const again = createFontOutliner("pacifico", pacificoBytes());
  assert.equal(again.id, "pacifico");
  assert.deepEqual(again.outline("Los Muñoz", 25), nameFont.outline("Los Muñoz", 25));
});
