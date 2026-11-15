import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_LAYOUT, SAMPLE_NAMES, occupiedTiles } from "../../src/core/preview/sampleLayout.ts";

test("sample has no duplicate cells and counts shared cells once", () => {
  const tiles = occupiedTiles(SAMPLE_NAMES, SAMPLE_LAYOUT);
  const keys = tiles.map((t) => `${t.x},${t.y}`);
  assert.equal(new Set(keys).size, keys.length);
  const letters = SAMPLE_NAMES.reduce((sum, n) => sum + n.text.length, 0);
  const crossings = SAMPLE_LAYOUT.placements.length - 1;
  assert.equal(tiles.length, letters - crossings);
});

test("conflicting letters throw", () => {
  const names = [
    { id: "a", text: "CAT" },
    { id: "b", text: "DOG" },
  ];
  const layout = {
    ...SAMPLE_LAYOUT,
    placements: [
      { nameId: "a", start: { x: 0, y: 0 }, direction: "horizontal" as const },
      { nameId: "b", start: { x: 1, y: -1 }, direction: "vertical" as const },
    ],
  };
  assert.throws(() => occupiedTiles(names, layout), /Conflict/);
});
