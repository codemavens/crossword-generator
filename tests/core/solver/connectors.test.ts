import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDecoration,
  checkFit,
  eligibleDecorationSpots,
  evaluateLayout,
  gridOriginMm,
  removeDecorativeTile,
  validateLayout,
} from "../../../src/core/solver/index.ts";
import type { LayoutIssueCode, SolverOpening } from "../../../src/core/solver/index.ts";
import { DEFAULT_SOLVER_WEIGHTS } from "../../../src/core/models/defaults.ts";
import type { CrosswordLayout, DecorativeTile, NameEntry, NamePlacement } from "../../../src/core/models/project.ts";
import { circleOpening, run } from "./helpers.ts";
import { solve } from "../../../src/core/solver/index.ts";

const H = "horizontal" as const;
const V = "vertical" as const;

function place(nameId: string, x: number, y: number, direction: typeof H | typeof V): NamePlacement {
  return { nameId, start: { x, y }, direction };
}

function layout(placements: NamePlacement[], decorativeTiles: DecorativeTile[] = []): CrosswordLayout {
  return { id: "t", seed: 0, placements, decorativeTiles, offset: { xMm: 0, yMm: 0 } };
}

function connector(x: number, y: number, nameId: string, end: "start" | "end", joinsNameId: string, id = `c-${nameId}-${end}`): DecorativeTile {
  return { id, position: { x, y }, artworkId: null, source: "automatic", purpose: "connector", anchor: { nameId, end }, joinsNameId };
}

function decoration(x: number, y: number, nameId: string, end: "start" | "end", id = `d-${nameId}-${end}`): DecorativeTile {
  return { id, position: { x, y }, artworkId: null, source: "manual", purpose: "decoration", anchor: { nameId, end } };
}

function codes(names: NameEntry[], l: CrosswordLayout): LayoutIssueCode[] {
  return [...new Set(validateLayout(names, l).map((i) => i.code))].sort();
}

const MIKE_BOB: NameEntry[] = [
  { id: "m", text: "MIKE" },
  { id: "b", text: "BOB" },
];
const MIKE_JOHN: NameEntry[] = [
  { id: "m", text: "MIKE" },
  { id: "j", text: "JOHN" },
];
// SPEC §6.4 L-corner: M I K E [*] with BOB running down from the square under the tile.
const L_CORNER = layout([place("m", 0, 0, H), place("b", 4, 1, V)], [connector(4, 0, "m", "end", "b")]);
// SPEC §6.4 T-shape: M I K E [*] J with JOHN running down from the square past the tile.
const T_SHAPE = layout([place("m", 0, 0, H), place("j", 5, 0, V)], [connector(4, 0, "m", "end", "j")]);

test("the L-corner of SPEC §6.4 is valid, also with the joined name ending at the tile", () => {
  assert.deepEqual(validateLayout(MIKE_BOB, L_CORNER), []);
  const ending = layout([place("m", 0, 0, H), place("b", 4, -3, V)], [connector(4, 0, "m", "end", "b")]);
  assert.deepEqual(validateLayout(MIKE_BOB, ending), []);
  // The same picture anchored on BOB instead of MIKE.
  const flipped = layout([place("m", 0, 0, H), place("b", 4, 1, V)], [connector(4, 0, "b", "start", "m")]);
  assert.deepEqual(validateLayout(MIKE_BOB, flipped), []);
});

test("the T-shape of SPEC §6.4 is valid, also with the joined name passing the tile mid-name", () => {
  assert.deepEqual(validateLayout(MIKE_JOHN, T_SHAPE), []);
  const middle = layout([place("m", 0, 0, H), place("j", 5, -2, V)], [connector(4, 0, "m", "end", "j")]);
  assert.deepEqual(validateLayout(MIKE_JOHN, middle), []);
  // Anchored on JOHN: its start tile sits beside MIKE's K.
  const beside = layout([place("m", 0, 0, H), place("j", 2, 2, V)], [connector(2, 1, "j", "start", "m")]);
  assert.deepEqual(validateLayout(MIKE_JOHN, beside), []);
});

test("a connector not touching its joined name in either shape is rejected", () => {
  const gap = layout([place("m", 0, 0, H), place("b", 6, 0, V)], [connector(4, 0, "m", "end", "b")]);
  assert.deepEqual(codes(MIKE_BOB, gap), ["connector-shape-invalid", "disconnected"]);
});

test("a two-tile chain is rejected and does not connect", () => {
  // MIKE [*][*] with BOB starting under the second tile.
  const chain = layout([place("m", 0, 0, H), place("b", 5, 1, V)], [decoration(4, 0, "m", "end"), decoration(5, 0, "b", "start")]);
  const issues = validateLayout(MIKE_BOB, chain);
  assert.deepEqual([...new Set(issues.map((i) => i.code))].sort(), ["disconnected", "tile-chain"]);
  assert.match(issues.find((i) => i.code === "tile-chain")!.message, /MIKE.*BOB/);
  const asConnectors = layout([place("m", 0, 0, H), place("b", 5, 1, V)], [connector(4, 0, "m", "end", "b"), connector(5, 0, "b", "start", "m", "c2")]);
  assert.ok(codes(MIKE_BOB, asConnectors).includes("tile-chain"));
});

test("a connector between parallel names is rejected by name", () => {
  const parallel = layout([place("m", 0, 0, H), place("b", 5, 0, H)], [connector(4, 0, "m", "end", "b")]);
  const issues = validateLayout(MIKE_BOB, parallel);
  const found = issues.find((i) => i.code === "connector-parallel-names");
  assert.ok(found);
  assert.deepEqual(found.nameIds, ["m", "b"]);
  assert.match(found.message, /MIKE and BOB/);
  assert.ok(issues.some((i) => i.code === "disconnected"));
});

test("a tile at an interior position or inside a name is rejected", () => {
  // Under MIKE's K, beside the name rather than past its end.
  const beside = layout([place("m", 0, 0, H), place("b", 2, 2, V)], [connector(2, 1, "m", "end", "b")]);
  assert.ok(codes(MIKE_BOB, beside).includes("tile-not-at-name-end"));
  const inside = layout([place("m", 0, 0, H), place("b", 4, 1, V)], [connector(1, 0, "m", "end", "b")]);
  const issue = validateLayout(MIKE_BOB, inside).find((i) => i.code === "tile-overlaps-name");
  assert.ok(issue);
  assert.match(issue.message, /inside MIKE/);
  const onOther = layout([place("m", 0, 0, H), place("b", 4, 0, V)], [decoration(4, 0, "m", "end")]);
  assert.ok(codes(MIKE_BOB, onOther).includes("tile-overlaps-name"));
});

test("two connectors between the same pair of names are rejected", () => {
  const twice = layout([place("m", 0, 0, H), place("b", 4, 1, V)], [connector(4, 0, "m", "end", "b"), connector(4, 4, "b", "end", "m")]);
  const issue = validateLayout(MIKE_BOB, twice).find((i) => i.code === "duplicate-connector");
  assert.ok(issue);
  assert.match(issue.message, /BOB and MIKE are joined by more than one connector/);
});

test("a connector touching a third name is rejected by name", () => {
  const names = [...MIKE_BOB, { id: "y", text: "YE" }];
  // YE runs down to the square just past the tile, so the tile touches it.
  const l = layout([place("m", 0, 0, H), place("b", 4, 1, V), place("y", 5, -1, V)], [connector(4, 0, "m", "end", "b")]);
  const issue = validateLayout(names, l).find((i) => i.code === "connector-touches-other-name");
  assert.ok(issue);
  assert.match(issue.message, /touches YE/);
  assert.ok(issue.nameIds.includes("y"));
});

const ANNA_BEN: NameEntry[] = [
  { id: "a", text: "ANNA" },
  { id: "b", text: "BEN" },
];
// ANNA across row 1; BEN down column 1 crossing at the first N.
const CROSSING = layout([place("a", 0, 1, H), place("b", 1, -1, V)]);

test("a manual end tile is valid at either end of a name", () => {
  assert.deepEqual(validateLayout(ANNA_BEN, { ...CROSSING, decorativeTiles: [decoration(4, 1, "a", "end")] }), []);
  assert.deepEqual(validateLayout(ANNA_BEN, { ...CROSSING, decorativeTiles: [decoration(-1, 1, "a", "start")] }), []);
  assert.deepEqual(validateLayout(ANNA_BEN, { ...CROSSING, decorativeTiles: [decoration(1, -2, "b", "start")] }), []);
});

test("each invalid manual end tile is reported", () => {
  const withTiles = (...tiles: DecorativeTile[]) => codes(ANNA_BEN, { ...CROSSING, decorativeTiles: tiles });
  // Beside ANNA's last A rather than past it.
  assert.deepEqual(withTiles(decoration(3, 2, "a", "end")), ["tile-not-at-name-end"]);
  // On top of a letter.
  assert.deepEqual(withTiles(decoration(2, 1, "a", "end")), ["tile-overlaps-name"]);
  // Two tiles on one name end.
  assert.deepEqual(withTiles(decoration(4, 1, "a", "end", "x"), decoration(4, 1, "a", "end", "y")), ["tile-overlaps-tile"]);
  assert.deepEqual(withTiles(decoration(4, 1, "a", "end", "same"), decoration(-1, 1, "a", "start", "same")), ["duplicate-tile-id"]);
  assert.deepEqual(withTiles({ ...decoration(4, 1, "a", "end"), joinsNameId: "b" }), ["invalid-decorative-tile"]);
  assert.deepEqual(withTiles({ ...connector(4, 1, "a", "end", "a") }), ["invalid-decorative-tile"]);
  assert.deepEqual(withTiles(decoration(4, 1, "zz", "end")), ["tile-unknown-name"]);
  assert.deepEqual(withTiles({ ...decoration(4, 1, "a", "end"), position: { x: 4.5, y: 1 } }), ["invalid-decorative-tile"]);
  assert.deepEqual(withTiles({ ...decoration(4, 1, "a", "end"), anchor: { nameId: "a", end: "middle" } } as unknown as DecorativeTile), [
    "invalid-decorative-tile",
  ]);
});

test("a manual decoration touching another name is rejected and is not a connection", () => {
  const names = [
    { id: "a", text: "ANNA" },
    { id: "o", text: "BOB" },
  ];
  // BOB runs down past the decoration after ANNA.
  const l = layout([place("a", 0, 0, H), place("o", 5, -1, V)], [decoration(4, 0, "a", "end")]);
  const issues = validateLayout(names, l);
  assert.deepEqual([...new Set(issues.map((i) => i.code))].sort(), ["decoration-touches-name", "disconnected"]);
  assert.match(issues.find((i) => i.code === "decoration-touches-name")!.message, /touches BOB.*end of ANNA/);
});

test("names joined only by contact with a connector of other names stay disconnected", () => {
  const names = [...MIKE_BOB, { id: "y", text: "YE" }];
  const l = layout([place("m", 0, 0, H), place("b", 4, 1, V), place("y", 5, -1, V)], [connector(4, 0, "m", "end", "b")]);
  const disconnected = validateLayout(names, l).find((i) => i.code === "disconnected");
  assert.ok(disconnected);
  assert.match(disconnected.message, /MIKE, BOB \| YE/);
});

test("two names with no shared characters are joined by one connector", () => {
  const { names, result } = run(["MIKE", "BOB"]);
  assert.equal(result.failure, undefined);
  assert.ok(result.layouts.length > 1);
  for (const l of result.layouts) {
    assert.equal(l.connectorCount, 1);
    assert.equal(l.layout.decorativeTiles.length, 1);
    const tile = l.layout.decorativeTiles[0]!;
    assert.equal(tile.source, "automatic");
    assert.equal(tile.artworkId, null);
    assert.equal(l.tileCount, 8);
    assert.deepEqual(validateLayout(names, l.layout), []);
  }
});

test("both connector shapes are found", () => {
  const layouts = [run(["MIKE", "JOHN"], { mode: "balanced" }), run(["ANNA", "NAN", "BOB", "ROB"])].flatMap((r) => r.result.layouts);
  const shapes = new Set(
    layouts.map((l) => {
      const t = l.layout.decorativeTiles[0]!;
      const joined = l.layout.placements.find((p) => p.nameId === t.joinsNameId)!;
      const along = joined.direction === "horizontal" ? t.position.y === joined.start.y : t.position.x === joined.start.x;
      return along ? "L" : "T";
    }),
  );
  assert.deepEqual([...shapes].sort(), ["L", "T"]);
});

const GROUPS = ["ANNA", "HANNAH", "ELLA", "LEAH", "BOB", "ROB", "KIT", "TIM", "JUDY", "GUS"];

test("later names join by shared letters after a connector, and fewer connectors rank higher", () => {
  // Four letter groups: at least three connectors, and each group crosses internally.
  const { result } = run(GROUPS, { mode: "balanced" });
  assert.equal(result.failure, undefined);
  assert.ok(result.layouts.length > 0);
  for (const l of result.layouts) {
    assert.ok(l.connectorCount >= 3);
    assert.ok(l.intersectionCount >= GROUPS.length - 1 - l.connectorCount);
    assert.ok(l.layout.decorativeTiles.every((t) => t.source === "automatic" && t.purpose === "connector"));
  }
  const fewer = result.layouts.map((l) => l.score.breakdown.fewConnectors);
  assert.ok(fewer.every((v, i) => v === 1 / (1 + result.layouts[i]!.connectorCount)));
});

test("connector layouts are deterministic for the same seed", () => {
  const opening = circleOpening(12, 0.4);
  const a = run(GROUPS, { seed: 5, opening }).result;
  const b = run(GROUPS, { seed: 5, opening }).result;
  assert.deepEqual(a, b);
  assert.deepEqual(structuredClone(a), a);
});

test("fit, tile count and bounds of solved layouts include connector tiles", () => {
  const { names, result } = run(["MIKE", "BOB"], { opening: circleOpening(6, 0.2) });
  for (const l of result.layouts) {
    assert.equal(l.fit!.tileCount, l.tileCount);
    assert.deepEqual(checkFit(l.layout, names, circleOpening(6, 0.2)), l.fit);
    const t = l.layout.decorativeTiles[0]!.position;
    assert.ok(t.x >= l.bounds.minX && t.x <= l.bounds.maxX && t.y >= l.bounds.minY && t.y <= l.bounds.maxY);
  }
});

test("the transpose of a connector layout is still valid", () => {
  const { names, result } = run(GROUPS);
  for (const l of result.layouts) {
    const flipped: CrosswordLayout = {
      ...l.layout,
      placements: l.layout.placements.map((p) => ({ ...p, start: { x: p.start.y, y: p.start.x }, direction: p.direction === H ? V : H })),
      decorativeTiles: l.layout.decorativeTiles.map((t) => ({ ...t, position: { x: t.position.y, y: t.position.x } })),
    };
    assert.deepEqual(validateLayout(names, flipped), []);
  }
});

function square(half: number, tileSizeMm = 10): SolverOpening {
  const polygon = [
    { x: -half, y: -half },
    { x: half, y: -half },
    { x: half, y: half },
    { x: -half, y: half },
  ];
  return { polygon, centroid: { x: 0, y: 0 }, clearance: 0, tileSizeMm };
}

test("fit and centring include a manual tile, even at a negative grid position", () => {
  const names = [{ id: "m", text: "MIKE" }];
  const alone = layout([place("m", 0, 0, H)]);
  const added = addDecoration(names, alone, { nameId: "m", end: "start" });
  assert.ok(added.ok);
  assert.deepEqual(added.layout.decorativeTiles[0]!.position, { x: -1, y: 0 });
  // Four squares fit a 4-wide opening; five do not.
  assert.equal(checkFit(alone, names, square(2)).fits, true);
  const fit = checkFit(added.layout, names, square(2));
  assert.equal(fit.fits, false);
  assert.equal(fit.tileCount, 5);
  // Centring: MIKE spans x 0..4 tiles, centred at 2; with the tile it spans -1..4, centred at 1.5.
  assert.deepEqual(gridOriginMm(alone, names, { x: 0, y: 0 }, 10), { x: -20, y: -5 });
  assert.deepEqual(gridOriginMm(added.layout, names, { x: 0, y: 0 }, 10), { x: -15, y: -5 });
  const evaluated = evaluateLayout(names, added.layout, { ...DEFAULT_SOLVER_WEIGHTS }, square(2));
  assert.deepEqual(evaluated.bounds, { minX: -1, minY: 0, maxX: 3, maxY: 0, width: 5, height: 1 });
  assert.equal(evaluated.tileCount, 5);
});

test("a manual decoration does not change the score or the connector count", () => {
  const opening = circleOpening(8, 0.3);
  const { names, result } = run(["MIKE", "BOB"], { opening });
  const solved = result.layouts[0]!;
  const before = evaluateLayout(names, solved.layout, { ...DEFAULT_SOLVER_WEIGHTS }, opening);
  assert.deepEqual(before.score, solved.score);
  const spot = eligibleDecorationSpots(names, solved.layout)[0]!;
  const added = addDecoration(names, solved.layout, spot);
  assert.ok(added.ok);
  const after = evaluateLayout(names, added.layout, { ...DEFAULT_SOLVER_WEIGHTS }, opening);
  assert.deepEqual(after.score, solved.score);
  assert.equal(after.connectorCount, 1);
  assert.equal(after.tileCount, solved.tileCount + 1);
  assert.deepEqual(after.issues.filter((i) => i.severity === "error"), []);
});

test("eligible decoration spots skip ends that hold or touch a tile", () => {
  assert.deepEqual(eligibleDecorationSpots(MIKE_BOB, L_CORNER), [
    { nameId: "m", end: "start", position: { x: -1, y: 0 } },
    { nameId: "b", end: "end", position: { x: 4, y: 4 } },
  ]);
  // Every offered spot is accepted, and every refused end is refused by addDecoration too.
  for (const { nameId, end } of [
    { nameId: "m", end: "end" },
    { nameId: "b", end: "start" },
  ] as const) {
    const refused = addDecoration(MIKE_BOB, L_CORNER, { nameId, end });
    assert.equal(refused.ok, false);
  }
  // A second decoration elsewhere stays eligible; the end already decorated does not.
  const first = addDecoration(MIKE_BOB, L_CORNER, { nameId: "m", end: "start" });
  assert.ok(first.ok);
  assert.deepEqual(validateLayout(MIKE_BOB, first.layout), []);
  assert.deepEqual(eligibleDecorationSpots(MIKE_BOB, first.layout).map((s) => `${s.nameId}-${s.end}`), ["b-end"]);
  assert.equal(first.layout.decorativeTiles.at(-1)!.id, "manual-m-start");
});

test("a decoration that would touch another name is not offered", () => {
  // ANNA across row 1; BEN down column 4 ending just above the square after ANNA (already-broken layout: not connected).
  const tight = layout([place("a", 0, 1, H), place("b", 4, -2, V)], []);
  // That one square is the end of both names and would touch the other name's last letter.
  const spots = eligibleDecorationSpots(ANNA_BEN, tight).map((s) => `${s.nameId}-${s.end}`);
  assert.deepEqual(spots, ["a-start", "b-start"]);
});

test("removing a tile removes manual tiles only", () => {
  const added = addDecoration(MIKE_BOB, L_CORNER, { nameId: "b", end: "end" });
  assert.ok(added.ok);
  const removed = removeDecorativeTile(added.layout, "manual-b-end");
  assert.deepEqual(removed.decorativeTiles, L_CORNER.decorativeTiles);
  assert.equal(removeDecorativeTile(L_CORNER, "c-m-end"), L_CORNER);
  assert.equal(removeDecorativeTile(L_CORNER, "nope"), L_CORNER);
});

const LIMITS_MS = { quick: 1000, balanced: 3000, thorough: 10000 } as const;
for (const mode of ["quick", "balanced", "thorough"] as const) {
  test(`ten names needing connectors in ${mode} mode finish within ${LIMITS_MS[mode]} ms`, () => {
    const started = performance.now();
    const { result } = run(GROUPS, { mode, opening: circleOpening(12, 0.4) });
    const elapsed = performance.now() - started;
    assert.equal(result.failure, undefined);
    assert.ok(result.layouts.length > 0);
    assert.ok(elapsed < LIMITS_MS[mode], `${mode} took ${elapsed.toFixed(0)} ms`);
  });
}

test("no returned connector touches a third name at a crossing square", () => {
  for (const mode of ["quick", "balanced"] as const) {
    const names = ["MIKE", "BOB", "EVE"].map((text, i) => ({ id: `n${i}`, text }));
    const result = solve({ names, settings: { seed: 1, searchMode: mode, weights: DEFAULT_SOLVER_WEIGHTS } });
    assert.ok(result.layouts.length > 0);
    for (const s of result.layouts) {
      assert.deepEqual(validateLayout(names, s.layout), []);
      const letters = new Map<string, Set<string>>();
      for (const p of s.layout.placements) {
        const text = names.find((n) => n.id === p.nameId)!.text;
        for (let i = 0; i < text.length; i++) {
          const k = `${p.start.x + (p.direction === "horizontal" ? i : 0)},${p.start.y + (p.direction === "vertical" ? i : 0)}`;
          if (!letters.has(k)) letters.set(k, new Set());
          letters.get(k)!.add(p.nameId);
        }
      }
      for (const t of s.layout.decorativeTiles) {
        const ok = new Set([t.anchor.nameId, t.joinsNameId]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          for (const id of letters.get(`${t.position.x + dx},${t.position.y + dy}`) ?? []) {
            assert.ok(ok.has(id), `tile ${t.id} touches ${id}`);
          }
        }
      }
    }
  }
});
