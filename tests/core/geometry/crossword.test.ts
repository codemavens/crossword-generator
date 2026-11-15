import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCrosswordGeometry } from "../../../src/core/geometry/crossword.ts";
import type { CrosswordGeometry, CrosswordInput, Segment } from "../../../src/core/geometry/crossword.ts";
import { traceOutline } from "../../../src/core/geometry/gridOutline.ts";
import { letterValue } from "../../../src/core/geometry/letterValues.ts";
import { ringsBounds, signedArea } from "../../../src/core/geometry/ringMath.ts";
import type { FontOutliner, Point, Ring } from "../../../src/core/geometry/types.ts";
import { addDecoration, eligibleDecorationSpots } from "../../../src/core/solver/index.ts";
import { ARTWORK_MARGIN_RATIO } from "../../../src/core/artwork/constants.ts";
import type { ArtworkAsset, CrosswordLayout, DecorativeTile, NamePlacement } from "../../../src/core/models/project.ts";
import { isSimpleRing, yearFont } from "./helpers.ts";
import { entries, run, TEN_NAMES } from "../solver/helpers.ts";

const EPS = 1e-9;

function layoutOf(placements: NamePlacement[], decorativeTiles: DecorativeTile[] = []): CrosswordLayout {
  return { id: "t", seed: 0, placements, decorativeTiles, offset: { xMm: 0, yMm: 0 } };
}

function build(over: Partial<CrosswordInput> & Pick<CrosswordInput, "names" | "layout">): CrosswordGeometry {
  return buildCrosswordGeometry({
    tileSizeMm: 12.7,
    originMm: { x: 0, y: 0 },
    tileFont: yearFont,
    showScores: true,
    artwork: [],
    ...over,
  });
}

const solved = (() => {
  const { names, result } = run(TEN_NAMES);
  return { names, layout: result.layouts[0]!.layout };
})();

// A 3×3 ring of four names around the empty square (1, 1).
const loopNames = entries(["ABC", "ADE", "CFG", "EHG"]);
const loopLayout = layoutOf([
  { nameId: "n0", start: { x: 0, y: 0 }, direction: "horizontal" },
  { nameId: "n1", start: { x: 0, y: 0 }, direction: "vertical" },
  { nameId: "n2", start: { x: 2, y: 0 }, direction: "vertical" },
  { nameId: "n3", start: { x: 0, y: 2 }, direction: "horizontal" },
]);

function ringSegments(ring: Ring): Segment[] {
  return ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length]! }));
}

function len(s: Segment): number {
  return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
}

// Overlap length of two axis-aligned segments on the same line (0 if they only touch or differ).
function overlap(p: Segment, q: Segment): number {
  const pv = Math.abs(p.a.x - p.b.x) < EPS;
  const qv = Math.abs(q.a.x - q.b.x) < EPS;
  if (pv !== qv) return 0;
  if (pv) {
    if (Math.abs(p.a.x - q.a.x) > 1e-6) return 0;
    const lo = Math.max(Math.min(p.a.y, p.b.y), Math.min(q.a.y, q.b.y));
    const hi = Math.min(Math.max(p.a.y, p.b.y), Math.max(q.a.y, q.b.y));
    return Math.max(0, hi - lo);
  }
  if (Math.abs(p.a.y - q.a.y) > 1e-6) return 0;
  const lo = Math.max(Math.min(p.a.x, p.b.x), Math.min(q.a.x, q.b.x));
  const hi = Math.min(Math.max(p.a.x, p.b.x), Math.max(q.a.x, q.b.x));
  return Math.max(0, hi - lo);
}

function cutSegments(g: CrosswordGeometry): Segment[] {
  return [g.cut.outer, ...g.cut.holes].flatMap(ringSegments);
}

function sharedEdgeCount(g: CrosswordGeometry): number {
  const set = new Set(g.tiles.map((t) => `${t.x},${t.y}`));
  let n = 0;
  for (const t of g.tiles) {
    if (set.has(`${t.x + 1},${t.y}`)) n++;
    if (set.has(`${t.x},${t.y + 1}`)) n++;
  }
  return n;
}

function inside(rings: Ring[], x0: number, y0: number, x1: number, y1: number): boolean {
  const b = ringsBounds(rings);
  return b.minX >= x0 - EPS && b.minY >= y0 - EPS && b.maxX <= x1 + EPS && b.maxY <= y1 + EPS;
}

function scaled(p: Point, k: number): Point {
  return { x: p.x * k, y: p.y * k };
}

test("every tile is a square of the configured size, and tile size rescales all geometry", () => {
  const a = build({ ...solved, tileSizeMm: 10 });
  const b = build({ ...solved, tileSizeMm: 20 });
  for (const tile of a.tiles) assert.equal(tile.rect.size, 10);
  for (const tile of b.tiles) assert.equal(tile.rect.size, 20);
  assert.deepEqual(b.cut.outer, a.cut.outer.map((p) => scaled(p, 2)));
  assert.deepEqual(b.score, a.score.map((s) => ({ a: scaled(s.a, 2), b: scaled(s.b, 2) })));
  // Curve flattening depends on size, so compare each engraving's extent rather than its vertices.
  const near = (p: Ring[], q: Ring[]) => {
    const u = ringsBounds(p);
    const v = ringsBounds(q);
    return [u.minX - v.minX / 2, u.minY - v.minY / 2, u.maxX - v.maxX / 2, u.maxY - v.maxY / 2].every((d) => Math.abs(d) < 0.02);
  };
  a.tiles.forEach((tile, i) => {
    assert.ok(near(tile.letter, b.tiles[i]!.letter), `letter ${tile.char}`);
    assert.ok(near(tile.score, b.tiles[i]!.score), `score ${tile.char}`);
  });
});

test("shared intersections are one tile each", () => {
  const g = build(solved);
  const keys = g.tiles.map((t) => `${t.x},${t.y}`);
  assert.equal(new Set(keys).size, keys.length);
  const letters = solved.names.reduce((n, e) => n + e.text.length, 0);
  assert.ok(g.tiles.length < letters, "a real layout has at least one shared square");
});

test("outer cut is one simple, axis-aligned ring whose area matches the tiles", () => {
  for (const g of [build(solved), build({ names: loopNames, layout: loopLayout })]) {
    const t = g.tileSizeMm;
    assert.deepEqual(g.problems.filter((p) => p.severity === "error"), []);
    assert.ok(isSimpleRing(g.cut.outer));
    assert.ok(signedArea(g.cut.outer) > 0, "outer is clockwise on screen (y down)");
    for (const h of g.cut.holes) assert.ok(signedArea(h) < 0, "holes run the other way");
    for (const s of ringSegments(g.cut.outer)) {
      assert.ok(Math.abs(s.a.x - s.b.x) < EPS || Math.abs(s.a.y - s.b.y) < EPS, "axis-aligned");
    }
    // Collinear edges are merged: consecutive edges always turn.
    const r = g.cut.outer;
    for (let i = 0; i < r.length; i++) {
      const p = r[(i + r.length - 1) % r.length]!;
      const c = r[i]!;
      const n = r[(i + 1) % r.length]!;
      assert.notEqual(Math.abs((c.x - p.x) * (n.y - c.y) - (c.y - p.y) * (n.x - c.x)) < EPS, true);
    }
    const area = signedArea(g.cut.outer) + g.cut.holes.reduce((s, h) => s + signedArea(h), 0);
    assert.ok(Math.abs(area - g.tiles.length * t * t) < 1e-6);
  }
});

test("a ring of names around an empty square gives exactly one hole", () => {
  const t = 10;
  const g = build({ names: loopNames, layout: loopLayout, tileSizeMm: t });
  assert.equal(g.tiles.length, 8);
  assert.equal(g.cut.holes.length, 1);
  const hole = g.cut.holes[0]!;
  assert.equal(hole.length, 4);
  assert.deepEqual(ringsBounds([hole]), { minX: t, minY: t, maxX: 2 * t, maxY: 2 * t });
  assert.equal(g.cut.outer.length, 4);
  assert.ok(Math.abs(signedArea(g.cut.outer) - 9 * t * t) < 1e-9);
});

test("squares touching only at a corner: the hole is its own simple ring touching the outer at one point", () => {
  // 3×3 block without (1, 0) (enclosed) and (0, 1) (outside); (0, 0) and (1, 1) touch only at the corner (1, 1).
  const a = [{ x: 0, y: -1 }, { x: 1, y: -1 }, { x: 2, y: -1 }, { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }];
  // Mirror image, so the pinch has the other diagonal.
  const b = a.map((p) => ({ x: -p.x, y: p.y }));
  for (const cells of [a, b]) {
    const o = traceOutline(cells);
    assert.equal(o.outers.length, 1);
    assert.equal(o.holes.length, 1);
    assert.equal(o.holes[0]!.length, 4);
    assert.ok(isSimpleRing(o.outers[0]!));
    // Each ring visits the pinch vertex once.
    const pinch = o.holes[0]!.filter((h) => o.outers[0]!.some((p) => p.x === h.x && p.y === h.y));
    assert.equal(pinch.length, 1);
    assert.equal(o.outers[0]!.filter((p) => p.x === pinch[0]!.x && p.y === pinch[0]!.y).length, 1);
    assert.equal(signedArea(o.outers[0]!) + signedArea(o.holes[0]!), cells.length);
  }
});

test("disconnected squares are a problem, never several silent outers", () => {
  const names = entries(["ABC", "DEF"]);
  const layout = layoutOf([
    { nameId: "n0", start: { x: 0, y: 0 }, direction: "horizontal" },
    { nameId: "n1", start: { x: 3, y: 1 }, direction: "horizontal" },
  ]);
  const g = build({ names, layout });
  assert.ok(g.problems.some((p) => p.code === "disconnected" && p.severity === "error"));
});

test("score lines: each shared edge once, merged, never on the cut and never overlapping", () => {
  for (const g of [build(solved), build({ names: loopNames, layout: loopLayout })]) {
    const t = g.tileSizeMm;
    const total = g.score.reduce((s, x) => s + len(x), 0);
    assert.ok(Math.abs(total - sharedEdgeCount(g) * t) < 1e-6);
    for (let i = 0; i < g.score.length; i++) {
      for (let j = i + 1; j < g.score.length; j++) {
        const p = g.score[i]!;
        const q = g.score[j]!;
        assert.ok(overlap(p, q) < 1e-9, "no overlapping score segments");
        // Collinear runs that touch end to end would have been merged.
        const sameLine = (Math.abs(p.a.x - p.b.x) < EPS) === (Math.abs(q.a.x - q.b.x) < EPS) &&
          (Math.abs(p.a.x - p.b.x) < EPS ? Math.abs(p.a.x - q.a.x) < EPS : Math.abs(p.a.y - q.a.y) < EPS);
        const touch = [p.a, p.b].some((u) => [q.a, q.b].some((v) => Math.abs(u.x - v.x) < EPS && Math.abs(u.y - v.y) < EPS));
        assert.ok(!(sameLine && touch), "contiguous runs are merged");
      }
    }
    const cuts = cutSegments(g);
    for (const s of g.score) for (const c of cuts) assert.ok(overlap(s, c) < 1e-9, "no score on a cut");
    for (let i = 0; i < cuts.length; i++) {
      for (let j = i + 1; j < cuts.length; j++) assert.ok(overlap(cuts[i]!, cuts[j]!) < 1e-9, "no duplicate cut segments");
    }
  }
});

test("score runs do not bridge a gap", () => {
  // Two names stacked with a gap column: rows y=0 and y=1 share edges at x=0..1 and x=3..4 but not x=2.
  const names = entries(["AB", "CD", "EBXF", "GDYH"]);
  const layout = layoutOf([
    { nameId: "n2", start: { x: 0, y: 0 }, direction: "horizontal" },
    { nameId: "n3", start: { x: 0, y: 1 }, direction: "horizontal" },
  ]);
  const g = build({ names, layout });
  const horizontal = g.score.filter((s) => Math.abs(s.a.y - s.b.y) < EPS);
  assert.equal(horizontal.length, 1);
  assert.ok(Math.abs(len(horizontal[0]!) - 4 * 12.7) < 1e-9);
});

test("letters are centred, share a baseline and stay inside their tile with a margin", () => {
  const g = build({ ...solved, showScores: false });
  const t = g.tileSizeMm;
  const margin = 0.04 * t;
  const baselines = new Set<number>();
  for (const tile of g.tiles) {
    assert.ok(tile.letter.length > 0, `tile ${tile.char} engraved`);
    const { x, y } = tile.rect;
    assert.ok(inside(tile.letter, x + margin, y + margin, x + t - margin, y + t - margin), `${tile.char} inside`);
    const b = ringsBounds(tile.letter);
    assert.ok(Math.abs((b.minX + b.maxX) / 2 - (x + t / 2)) < 1e-6, "centred horizontally");
    // Flat-bottomed capitals sit exactly on the baseline.
    if ("EHILMTZ".includes(tile.char!)) baselines.add(Math.round((b.maxY - y) * 1e6));
  }
  assert.equal(baselines.size, 1);
});

test("accented capitals rise above the cap box but stay inside the tile; punctuation keeps its height", () => {
  const names = entries(["ÅSE", "-O'"]);
  const layout = layoutOf([
    { nameId: "n0", start: { x: 0, y: 0 }, direction: "horizontal" },
    { nameId: "n1", start: { x: 0, y: 2 }, direction: "horizontal" },
  ]);
  const t = 12.7;
  const g = build({ names, layout, tileSizeMm: t });
  for (const tile of g.tiles) {
    assert.ok(inside(tile.letter, tile.rect.x, tile.rect.y, tile.rect.x + t, tile.rect.y + t));
  }
  // Bounds relative to the tile's top-left corner.
  const by = (c: string) => {
    const tile = g.tiles.find((x) => x.char === c)!;
    const b = ringsBounds(tile.letter);
    return { minY: b.minY - tile.rect.y, maxY: b.maxY - tile.rect.y };
  };
  assert.ok(by("Å").minY < by("E").minY);
  // The hyphen sits around mid cap height, the apostrophe near the top.
  assert.ok(by("-").minY > by("E").minY + 0.3 * t * 0.55);
  assert.ok(by("'").maxY < by("E").maxY - 0.3 * t * 0.55);
});

test("point values: on/off, base letter for accents, none for punctuation, decorative or letters without a base", () => {
  assert.equal(letterValue("Q"), 10);
  assert.equal(letterValue("É"), 1);
  assert.equal(letterValue("Ç"), 3);
  assert.equal(letterValue("Ø"), null);
  assert.equal(letterValue("Æ"), null);
  assert.equal(letterValue("'"), null);
  assert.equal(letterValue("-"), null);

  const names = entries(["ÉQ-", "ØZ"]);
  const layout = layoutOf([
    { nameId: "n0", start: { x: 0, y: 0 }, direction: "horizontal" },
    { nameId: "n1", start: { x: 0, y: 2 }, direction: "horizontal" },
  ]);
  const t = 12.7;
  const on = build({ names, layout, showScores: true, tileSizeMm: t });
  const off = build({ names, layout, showScores: false, tileSizeMm: t });
  assert.equal(off.engraving.scores.length, 0);
  const tile = (c: string) => on.tiles.find((x) => x.char === c)!;
  assert.ok(tile("É").score.length > 0);
  assert.ok(tile("Q").score.length > tile("É").score.length, "two digits for 10");
  assert.equal(tile("-").score.length, 0);
  assert.equal(tile("Ø").score.length, 0);
  // Lower-right corner, inside the tile.
  const e = tile("É");
  const b = ringsBounds(e.score);
  assert.ok(b.minX > e.rect.x + t / 2 && b.minY > e.rect.y + t / 2);
  assert.ok(inside(e.score, e.rect.x, e.rect.y, e.rect.x + t, e.rect.y + t));

  const deco = decoratedLayout();
  const g = build({ ...deco, showScores: true });
  for (const d of g.tiles.filter((x) => x.kind === "decorative")) assert.equal(d.score.length, 0);
});

function decoratedLayout(): { names: CrosswordInput["names"]; layout: CrosswordLayout } {
  let layout = solved.layout;
  for (const spot of eligibleDecorationSpots(solved.names, layout).slice(0, 3)) {
    const r = addDecoration(solved.names, layout, { nameId: spot.nameId, end: spot.end });
    if (r.ok) layout = r.layout;
  }
  return { names: solved.names, layout };
}

test("decorative pictures are engraved inside the 15% margin with their fill rules", () => {
  const custom: ArtworkAsset = {
    id: "up1",
    name: "Ring",
    source: "custom",
    shapes: [{ d: "M0 0L10 0L10 10L0 10Z M3 3L7 3L7 7L3 7Z", fillRule: "evenodd" }],
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
  };
  const { names, layout } = decoratedLayout();
  const ids = ["builtin:heart", "up1", null];
  const tiles = layout.decorativeTiles.map((d, i) => ({ ...d, artworkId: ids[i % ids.length]! }));
  assert.ok(tiles.length >= 3);
  const t = 20;
  const g = build({ names, layout: { ...layout, decorativeTiles: tiles }, artwork: [custom], tileSizeMm: t });
  const m = ARTWORK_MARGIN_RATIO * t;
  for (const tile of g.tiles.filter((x) => x.kind === "decorative")) {
    const d = tiles.find((x) => x.id === tile.tileId)!;
    if (d.artworkId === null) {
      assert.equal(tile.artwork.length, 0);
      continue;
    }
    assert.ok(tile.artwork.length > 0);
    const rings = tile.artwork.flatMap((s) => s.rings);
    assert.ok(inside(rings, tile.rect.x + m - 1e-6, tile.rect.y + m - 1e-6, tile.rect.x + t - m + 1e-6, tile.rect.y + t - m + 1e-6));
    if (d.artworkId === "up1") {
      assert.equal(tile.artwork[0]!.fillRule, "evenodd");
      assert.equal(tile.artwork[0]!.rings.length, 2);
    }
  }
  assert.ok(g.engraving.artwork.length >= 2);
});

test("a missing glyph is reported by character and leaves that tile blank", () => {
  const base = yearFont;
  const font: FontOutliner = {
    id: "no-b",
    hasGlyphs: (s) => !s.includes("B") && base.hasGlyphs(s),
    outline: (s, size) => {
      if (s.includes("B")) throw new Error("no B");
      return base.outline(s, size);
    },
  };
  const g = build({ names: loopNames, layout: loopLayout, tileFont: font });
  const p = g.problems.find((x) => x.code === "missing-glyph");
  assert.ok(p);
  assert.equal(p.char, "B");
  assert.ok(p.message.includes("B"));
  assert.deepEqual(p.positions, [{ x: 1, y: 0 }]);
  assert.equal(g.tiles.find((x) => x.char === "B")!.letter.length, 0);
  assert.ok(g.tiles.find((x) => x.char === "A")!.letter.length > 0);
});

test("decorative tiles at negative grid coordinates", () => {
  const names = entries(["ABC", "ADE"]);
  const layout = layoutOf(
    [
      { nameId: "n0", start: { x: 0, y: 0 }, direction: "horizontal" },
      { nameId: "n1", start: { x: 0, y: 0 }, direction: "vertical" },
    ],
    [
      {
        id: "d1",
        position: { x: -1, y: 0 },
        artworkId: "builtin:star",
        source: "manual",
        purpose: "decoration",
        anchor: { nameId: "n0", end: "start" },
      },
    ],
  );
  const origin = { x: -40, y: -30 };
  const t = 10;
  const g = build({ names, layout, originMm: origin, tileSizeMm: t });
  const d = g.tiles.find((x) => x.tileId === "d1")!;
  assert.equal(d.kind, "decorative");
  assert.deepEqual(d.rect, { x: -50, y: -30, size: t });
  assert.ok(d.artwork.length > 0);
  assert.equal(g.bounds.minX, -50);
  assert.ok(Math.abs(signedArea(g.cut.outer) - 6 * t * t) < 1e-9);
  assert.ok(isSimpleRing(g.cut.outer));
});

test("output is deterministic", () => {
  const deco = decoratedLayout();
  const a = build(deco);
  const b = build(deco);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
