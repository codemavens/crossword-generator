import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_ARTWORK, DEFAULT_ARTWORK_ID, resolveArtwork } from "../../../src/core/artwork/builtin.ts";
import { BUILTIN_ARTWORK_IDS } from "../../../src/core/artwork/constants.ts";
import { artworkAssetProblem } from "../../../src/core/artwork/validateAsset.ts";
import { flattenSegments, parsePathData, segmentsBounds } from "../../../src/core/artwork/pathData.ts";
import type { ArtworkAsset } from "../../../src/core/models/project.ts";

test("the six built-in pictures exist with their fixed ids", () => {
  assert.deepEqual(BUILTIN_ARTWORK.map((a) => a.id), [...BUILTIN_ARTWORK_IDS]);
  assert.deepEqual(BUILTIN_ARTWORK.map((a) => a.id), ["builtin:heart", "builtin:star", "builtin:paw", "builtin:spade", "builtin:cat", "builtin:cow"]);
  assert.equal(DEFAULT_ARTWORK_ID, "builtin:heart");
  assert.ok(BUILTIN_ARTWORK.every((a) => a.source === "builtin"));
});

test("built-in pictures are in the stored form and their bounds match the geometry", () => {
  for (const a of BUILTIN_ARTWORK) {
    // The stored-form check applies to custom pictures; reuse it with a custom id and source.
    assert.equal(artworkAssetProblem({ ...a, id: "x", source: "custom" }), null, a.id);
    const segments = a.shapes.flatMap((s) => {
      const r = parsePathData(s.d, { strict: true });
      assert.ok(r.ok, a.id);
      return r.segments;
    });
    const b = segmentsBounds(segments)!;
    for (const k of ["minX", "minY", "maxX", "maxY"] as const) assert.ok(Math.abs(b[k] - a.bounds[k]) < 0.01, `${a.id} ${k}`);
    assert.ok(Math.max(a.bounds.maxX - a.bounds.minX, a.bounds.maxY - a.bounds.minY) > 99);
  }
});

test("symmetric built-ins are mirror images about their vertical centre line", () => {
  for (const id of BUILTIN_ARTWORK_IDS) {
    const a = BUILTIN_ARTWORK.find((x) => x.id === id)!;
    const cx = (a.bounds.minX + a.bounds.maxX) / 2;
    const pts = a.shapes.flatMap((s) => {
      const r = parsePathData(s.d, { strict: true });
      assert.ok(r.ok);
      return flattenSegments(r.segments, 0.05).flat();
    });
    // Every outline point has a mirrored partner close to the outline.
    for (const p of pts) {
      const mx = 2 * cx - p.x;
      const nearest = Math.min(...pts.map((q) => Math.hypot(q.x - mx, q.y - p.y)));
      assert.ok(nearest < 1.5, `${id} not symmetric near (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
    }
  }
});

test("resolveArtwork finds built-ins and custom pictures, null for blank, unknown and deleted ids", () => {
  const custom: ArtworkAsset[] = [{ id: "art-1", name: "Mine", source: "custom", shapes: [{ d: "M0 0L1 0L1 1Z", fillRule: "nonzero" }], bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } }];
  assert.equal(resolveArtwork(custom, "builtin:cow")?.name, "Cow");
  assert.equal(resolveArtwork(custom, "art-1")?.name, "Mine");
  assert.equal(resolveArtwork(custom, null), null);
  assert.equal(resolveArtwork(custom, "builtin:dragon"), null);
  assert.equal(resolveArtwork(custom, "art-2"), null);
  assert.equal(resolveArtwork([], "art-1"), null);
});
