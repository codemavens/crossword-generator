import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalForm, solve } from "../../../src/core/solver/index.ts";
import { layoutCells } from "../../../src/core/solver/grid.ts";
import { normalizeNames } from "../../../src/core/solver/normalize.ts";
import { DEFAULT_SOLVER_WEIGHTS } from "../../../src/core/models/defaults.ts";
import type { CrosswordLayout, NameEntry } from "../../../src/core/models/project.ts";
import { TEN_NAMES, circleOpening, entries, run } from "./helpers.ts";

function charsAt(names: NameEntry[], layout: CrosswordLayout): Map<string, string> {
  return new Map(layoutCells(normalizeNames(names).names, layout).map((c) => [`${c.x},${c.y}`, c.char]));
}

// Characters at squares where two names cross.
function crossingChars(names: NameEntry[], layout: CrosswordLayout): string[] {
  const norm = normalizeNames(names).names;
  const count = new Map<string, number>();
  for (const p of layout.placements) {
    const n = norm.find((x) => x.id === p.nameId)!;
    n.chars.forEach((_, i) => {
      const k = p.direction === "horizontal" ? `${p.start.x + i},${p.start.y}` : `${p.start.x},${p.start.y + i}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    });
  }
  const at = charsAt(names, layout);
  return [...count].filter(([, c]) => c > 1).map(([k]) => at.get(k)!);
}

test("two names sharing one character cross on it", () => {
  const { names, result } = run(["ANNA", "BEN"]);
  assert.equal(result.failure, undefined);
  assert.ok(result.layouts.length >= 1);
  for (const l of result.layouts) {
    assert.equal(l.intersectionCount, 1);
    assert.deepEqual(crossingChars(names, l.layout), ["N"]);
  }
});

test("names sharing several characters give several distinct layouts", () => {
  const { result } = run(["MARIA", "TOMAS"], { mode: "balanced" });
  assert.ok(result.layouts.length > 1);
});

test("repeated letters give valid layouts", () => {
  const { result } = run(["ANNA", "NAN", "HANNAH"], { mode: "balanced" });
  assert.ok(result.layouts.length > 1);
});

test("matching apostrophes and matching hyphens can cross", () => {
  const apostrophes = run(["O'NEIL", "D’ARCY"]);
  assert.ok(apostrophes.result.layouts.length > 0);
  for (const l of apostrophes.result.layouts) assert.deepEqual(crossingChars(apostrophes.names, l.layout), ["'"]);
  const hyphens = run(["JO-ANN", "KY-LIE"]);
  assert.ok(hyphens.result.layouts.length > 0);
  for (const l of hyphens.result.layouts) assert.deepEqual(crossingChars(hyphens.names, l.layout), ["-"]);
});

test("an apostrophe never crosses a hyphen, and É never crosses E", () => {
  assert.equal(run(["JO-BY", "D'ARC"]).result.failure?.code, "no-shared-letters");
  assert.equal(run(["JOSÉ", "BEN"]).result.failure?.code, "no-shared-letters");
  const { names, result } = run(["JOSÉ", "ÉVA"]);
  for (const l of result.layouts) assert.deepEqual(crossingChars(names, l.layout), ["É"]);
});

test("names with identical text are placed as separate names", () => {
  const { result } = run(["ANNA", "ANNA"]);
  assert.ok(result.layouts.length > 0);
  for (const l of result.layouts) {
    const [a, b] = l.layout.placements;
    assert.notEqual(a!.nameId, b!.nameId);
    assert.notEqual(a!.direction, b!.direction);
  }
});

test("ten names: every name exactly once, connected and valid", () => {
  const { result } = run(TEN_NAMES, { mode: "balanced" });
  assert.equal(result.failure, undefined);
  assert.equal(result.layouts.length, 8);
  for (const l of result.layouts) assert.ok(l.intersectionCount >= TEN_NAMES.length - 1);
});

test("a single name is its own layout", () => {
  const { result } = run(["ANNA"]);
  assert.equal(result.layouts.length, 1);
  assert.equal(result.layouts[0]!.intersectionCount, 0);
});

test("same seed gives the same ranked list; another seed can differ", () => {
  const opening = circleOpening(12, 0.4);
  const a = run(TEN_NAMES, { seed: 7, opening }).result;
  const b = run(TEN_NAMES, { seed: 7, opening }).result;
  assert.deepEqual(a, b);
  assert.ok(a.layouts.every((l) => l.layout.seed === 7));
  const differs = [8, 9, 10, 11].some((seed) => {
    const c = run(TEN_NAMES, { seed, opening }).result;
    return JSON.stringify(c.layouts.map((l) => l.layout.placements)) !== JSON.stringify(a.layouts.map((l) => l.layout.placements));
  });
  assert.ok(differs);
});

test("layout ids are deterministic and unique", () => {
  const { result } = run(TEN_NAMES);
  const ids = result.layouts.map((l) => l.layout.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith("layout-1-")));
});

test("results are plain data that survive structured cloning", () => {
  const { result } = run(TEN_NAMES, { opening: circleOpening(12, 0.4) });
  assert.deepEqual(structuredClone(result), result);
});

test("returned layouts are distinct under translation, rotation and mirroring", () => {
  for (const mode of ["quick", "thorough"] as const) {
    const { names, result } = run(TEN_NAMES, { mode });
    const forms = result.layouts.map((l) => canonicalForm(layoutCells(normalizeNames(names).names, l.layout)));
    assert.equal(new Set(forms).size, forms.length);
  }
});

test("canonical form ignores translation, transposition and rotation", () => {
  const names = normalizeNames(entries(["ANNE", "BEN"])).names;
  const base: CrosswordLayout = {
    id: "",
    seed: 0,
    decorativeTiles: [],
    offset: { xMm: 0, yMm: 0 },
    placements: [
      { nameId: "n0", start: { x: 0, y: 2 }, direction: "horizontal" },
      { nameId: "n1", start: { x: 1, y: 0 }, direction: "vertical" },
    ],
  };
  const transposed: CrosswordLayout = {
    ...base,
    placements: [
      { nameId: "n0", start: { x: 7, y: 5 }, direction: "vertical" },
      { nameId: "n1", start: { x: 5, y: 6 }, direction: "horizontal" },
    ],
  };
  const cells = layoutCells(names, base);
  assert.equal(canonicalForm(cells), canonicalForm(layoutCells(names, transposed)));
  const rotated = cells.map((c) => ({ x: -c.x + 3, y: -c.y, char: c.char }));
  assert.equal(canonicalForm(cells), canonicalForm(rotated));
  // Crossing ANNE's other N is a different picture.
  const moved = { ...base, placements: [base.placements[0]!, { ...base.placements[1]!, start: { x: 2, y: 0 } }] };
  assert.notEqual(canonicalForm(cells), canonicalForm(layoutCells(names, moved)));
});

test("names that cannot all be joined name the separate groups", () => {
  const { result } = run(["ANNA", "NAN", "BOB", "ROB"]);
  assert.equal(result.layouts.length, 0);
  assert.ok(result.failure?.code === "no-shared-letters");
  assert.deepEqual(result.failure.groups, [
    ["n0", "n1"],
    ["n2", "n3"],
  ]);
  assert.match(result.failure.message, /ANNA, NAN \| BOB, ROB/);
});

test("connected letters with no legal arrangement fail clearly", () => {
  // All three share only a leading A, and one square can hold just two names.
  const { result } = run(["AQ", "AZ", "AX"], { mode: "thorough" });
  assert.equal(result.layouts.length, 0);
  assert.equal(result.failure?.code, "no-arrangement-found");
});

test("invalid or excess names fail before searching", () => {
  const bad = solve({
    names: [
      { id: "a", text: "ANNA" },
      { id: "b", text: "B" },
    ],
    settings: { seed: 1, searchMode: "quick", weights: { ...DEFAULT_SOLVER_WEIGHTS } },
  });
  assert.equal(bad.failure?.code, "invalid-names");
  assert.deepEqual(bad.nameProblems.map((p) => p.nameId), ["b"]);
  const many = solve({
    names: entries(Array.from({ length: 21 }, () => "ANNA")),
    settings: { seed: 1, searchMode: "quick", weights: { ...DEFAULT_SOLVER_WEIGHTS } },
  });
  assert.equal(many.failure?.code, "too-many-names");
  const none = solve({ names: [], settings: { seed: 1, searchMode: "quick", weights: { ...DEFAULT_SOLVER_WEIGHTS } } });
  assert.equal(none.failure?.code, "no-names");
});

const LIMITS_MS = { quick: 1000, balanced: 3000, thorough: 10000 } as const;
for (const mode of ["quick", "balanced", "thorough"] as const) {
  test(`ten names in ${mode} mode finish within ${LIMITS_MS[mode]} ms`, () => {
    const started = performance.now();
    const { result } = run(TEN_NAMES, { mode, opening: circleOpening(12, 0.4) });
    const elapsed = performance.now() - started;
    assert.equal(result.failure, undefined);
    assert.ok(result.layouts.length > 0);
    assert.ok(elapsed < LIMITS_MS[mode], `${mode} took ${elapsed.toFixed(0)} ms`);
  });
}
