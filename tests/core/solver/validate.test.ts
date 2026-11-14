import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLayout } from "../../../src/core/solver/index.ts";
import type { LayoutIssueCode } from "../../../src/core/solver/index.ts";
import type { CrosswordLayout, NameEntry, NamePlacement } from "../../../src/core/models/project.ts";
import { SAMPLE_LAYOUT, SAMPLE_NAMES } from "../../../src/core/preview/sampleLayout.ts";

const H = "horizontal" as const;
const V = "vertical" as const;

function layout(placements: NamePlacement[], extra: Partial<CrosswordLayout> = {}): CrosswordLayout {
  return { id: "t", seed: 0, placements, decorativeTiles: [], offset: { xMm: 0, yMm: 0 }, ...extra };
}

function place(nameId: string, x: number, y: number, direction: typeof H | typeof V): NamePlacement {
  return { nameId, start: { x, y }, direction };
}

function codes(names: NameEntry[], l: CrosswordLayout): LayoutIssueCode[] {
  return [...new Set(validateLayout(names, l).map((i) => i.code))].sort();
}

const ANNA_BEN: NameEntry[] = [
  { id: "a", text: "ANNA" },
  { id: "b", text: "BEN" },
];

test("a valid crossing has no issues", () => {
  // ANNA across row 1; BEN down column 1 crossing at the first N.
  assert.deepEqual(validateLayout(ANNA_BEN, layout([place("a", 0, 1, H), place("b", 1, -1, V)])), []);
});

test("the hand-built sample layout is valid", () => {
  assert.deepEqual(validateLayout(SAMPLE_NAMES, SAMPLE_LAYOUT), []);
});

test("missing, unknown and duplicate placements are reported by name", () => {
  const issues = validateLayout(ANNA_BEN, layout([place("a", 0, 0, H), place("a", 0, 2, H), place("zz", 0, 4, H)]));
  const byCode = new Map(issues.map((i) => [i.code, i]));
  assert.deepEqual(byCode.get("missing-name")?.nameIds, ["b"]);
  assert.match(byCode.get("missing-name")!.message, /BEN/);
  assert.deepEqual(byCode.get("duplicate-placement")?.nameIds, ["a"]);
  assert.deepEqual(byCode.get("unknown-name")?.nameIds, ["zz"]);
});

test("short and unsupported name text are reported", () => {
  const names = [
    { id: "a", text: "A" },
    { id: "b", text: "B0B" },
  ];
  assert.deepEqual(codes(names, layout([place("a", 0, 0, H), place("b", 0, 2, H)])), ["invalid-name-text", "name-too-short"]);
});

test("a malformed placement from saved data is reported", () => {
  const bad = { nameId: "a", start: { x: 0.5, y: 0 }, direction: "diagonal" } as unknown as NamePlacement;
  assert.ok(codes(ANNA_BEN, layout([bad, place("b", 0, 2, H)])).includes("invalid-placement"));
});

test("crossing on different characters is a conflict", () => {
  // BEN down column 0 meets ANNA's A.
  // A mismatched crossing is not a connection either.
  assert.deepEqual(codes(ANNA_BEN, layout([place("a", 0, 1, H), place("b", 0, 0, V)])), ["conflicting-characters", "disconnected"]);
});

test("an apostrophe never crosses a hyphen", () => {
  const names = [
    { id: "a", text: "O'NEIL" },
    { id: "b", text: "JO-BY" },
  ];
  assert.ok(codes(names, layout([place("a", 0, 2, H), place("b", 1, 0, V)])).includes("conflicting-characters"));
});

test("É and E do not match", () => {
  const names = [
    { id: "a", text: "JOSÉ" },
    { id: "b", text: "BEN" },
  ];
  assert.ok(codes(names, layout([place("a", 0, 1, H), place("b", 3, 0, V)])).includes("conflicting-characters"));
});

test("same-direction overlap and containment are rejected", () => {
  const names = [
    { id: "a", text: "ANNA" },
    { id: "b", text: "NAB" },
    { id: "c", text: "NN" },
  ];
  // NAB overlaps ANNA's last two squares (N A) in the same row.
  const issues = validateLayout(names, layout([place("a", 0, 0, H), place("b", 2, 0, H), place("c", 1, 0, H)]));
  const found = issues.map((i) => i.code);
  assert.ok(found.includes("parallel-overlap"));
  assert.ok(found.includes("contained-name"));
});

test("parallel names side by side are rejected", () => {
  const names = [
    { id: "a", text: "ANNA" },
    { id: "b", text: "ANNE" },
    { id: "c", text: "NN" },
  ];
  // ANNA and ANNE in adjacent rows, linked by NN down column 1 so only the contact is wrong.
  const l = layout([place("a", 0, 0, H), place("b", 0, 1, H), place("c", 1, 0, V)]);
  assert.ok(codes(names, l).includes("side-by-side"));
});

test("accidental contact between unrelated names is rejected and not counted as a connection", () => {
  const names = [
    { id: "a", text: "ANNA" },
    { id: "b", text: "BOB" },
  ];
  // BOB down column 4 passes through the square just after ANNA without crossing it.
  const found = codes(names, layout([place("a", 0, 0, H), place("b", 4, -1, V)]));
  assert.ok(found.includes("end-not-clear"));
  assert.ok(found.includes("disconnected"));
  // BOB across row 1 lies along ANNA's underside.
  const along = codes(names, layout([place("a", 0, 0, H), place("b", 1, 1, H)]));
  assert.deepEqual(along, ["disconnected", "side-by-side"]);
});

test("an occupied square just before or after a name is rejected", () => {
  // BEN across x 0..2 runs straight into ANNA at x 3..6.
  const issues = validateLayout(ANNA_BEN, layout([place("a", 3, 0, H), place("b", 0, 0, H)]));
  assert.ok(issues.some((i) => i.code === "end-not-clear" && i.nameIds[0] === "a"));
  assert.ok(issues.some((i) => i.code === "end-not-clear" && i.nameIds[0] === "b"));
});

test("names that never cross are disconnected", () => {
  const names = [
    { id: "a", text: "ANNA" },
    { id: "b", text: "ANNE" },
  ];
  const issues = validateLayout(names, layout([place("a", 0, 0, H), place("b", 0, 5, H)]));
  assert.deepEqual(issues.map((i) => i.code), ["disconnected"]);
  assert.match(issues[0]!.message, /ANNA/);
});

test("squares of different names may touch at a corner", () => {
  const names = [
    { id: "a", text: "CAT" },
    { id: "b", text: "TEA" },
    { id: "c", text: "BA" },
  ];
  // CAT across row 0, TEA down column 2, BA across row 2 ending on TEA's A; BA's B touches TEA's E only at a corner.
  const l = layout([place("a", 0, 0, H), place("b", 2, 0, V), place("c", 1, 2, H)]);
  assert.deepEqual(validateLayout(names, l), []);
});
