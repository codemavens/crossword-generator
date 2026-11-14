import { test } from "node:test";
import assert from "node:assert/strict";
import { artworkTransform } from "../../../src/core/artwork/placement.ts";
import { ARTWORK_MARGIN_RATIO } from "../../../src/core/artwork/constants.ts";
import type { ArtworkBounds } from "../../../src/core/models/project.ts";

const eps = 1e-9;

function placed(bounds: ArtworkBounds, tile: number) {
  const t = artworkTransform(bounds, tile);
  const map = (x: number, y: number) => ({ x: x * t.scale + t.dx, y: y * t.scale + t.dy });
  return { t, min: map(bounds.minX, bounds.minY), max: map(bounds.maxX, bounds.maxY) };
}

test("pictures are centred, keep proportions and stay inside the 15% margin", () => {
  assert.equal(ARTWORK_MARGIN_RATIO, 0.15);
  const shapes: ArtworkBounds[] = [
    { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    { minX: 0, minY: 0, maxX: 100, maxY: 40 },
    { minX: -20, minY: 10, maxX: 5, maxY: 90 },
    { minX: 3, minY: 3, maxX: 3.5, maxY: 3.2 },
  ];
  for (const tile of [5, 9, 12.7, 25.4, 100]) {
    const margin = tile * 0.15;
    for (const b of shapes) {
      const { t, min, max } = placed(b, tile);
      assert.ok(min.x >= margin - eps && min.y >= margin - eps, `margin ${tile}`);
      assert.ok(max.x <= tile - margin + eps && max.y <= tile - margin + eps, `margin ${tile}`);
      // Centred.
      assert.ok(Math.abs((min.x + max.x) / 2 - tile / 2) < eps);
      assert.ok(Math.abs((min.y + max.y) / 2 - tile / 2) < eps);
      // The larger side fills the available width exactly; one uniform scale keeps proportions.
      const w = max.x - min.x;
      const h = max.y - min.y;
      assert.ok(Math.abs(Math.max(w, h) - tile * 0.7) < 1e-9);
      assert.ok(Math.abs(w / h - (b.maxX - b.minX) / (b.maxY - b.minY)) < 1e-9);
      assert.ok(t.scale > 0);
    }
  }
});

test("known values for a 12.7 mm tile", () => {
  const t = artworkTransform({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 12.7);
  assert.ok(Math.abs(t.scale - 0.0889) < 1e-12);
  assert.ok(Math.abs(t.dx - 1.905) < 1e-12);
  assert.ok(Math.abs(t.dy - (6.35 - 2.2225)) < 1e-12);
});

test("zero-size bounds do not divide by zero", () => {
  const point = artworkTransform({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, 10);
  assert.deepEqual(point, { scale: 0, dx: 5, dy: 5 });
  const flat = artworkTransform({ minX: 0, minY: 2, maxX: 10, maxY: 2 }, 10);
  assert.ok(Number.isFinite(flat.scale) && Number.isFinite(flat.dy));
  assert.ok(Math.abs(2 * flat.scale + flat.dy - 5) < eps);
});
