import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTO_GENERATE_DELAY_MS, decideAutoGenerate, firstArrangement } from "../../src/app/autoGenerate.ts";
import type { AutoGenerateFacts } from "../../src/app/autoGenerate.ts";
import type { SolveResult, SolvedLayout } from "../../src/core/solver/index.ts";

const opened: AutoGenerateFacts = {
  canGenerate: true,
  namesKey: "A",
  openedKey: "A",
  lastRunKey: null,
  layout: "matches",
};

test("a saved arrangement that matches its names is left alone on open", () => {
  assert.deepEqual(decideAutoGenerate(opened), { run: false });
});

test("opening with no arrangement generates at once", () => {
  assert.deepEqual(decideAutoGenerate({ ...opened, layout: "none" }), { run: true, delayMs: 0 });
});

test("opening with an arrangement that no longer matches generates at once", () => {
  assert.deepEqual(decideAutoGenerate({ ...opened, layout: "stale" }), { run: true, delayMs: 0 });
});

test("a name change generates after the pause, even over a matching arrangement", () => {
  const edited = { ...opened, namesKey: "B", layout: "matches" as const };
  assert.deepEqual(decideAutoGenerate(edited), { run: true, delayMs: AUTO_GENERATE_DELAY_MS });
});

test("nothing runs while generation is impossible", () => {
  assert.deepEqual(decideAutoGenerate({ ...opened, canGenerate: false, layout: "none" }), { run: false });
  assert.deepEqual(decideAutoGenerate({ ...opened, canGenerate: false, namesKey: "B" }), { run: false });
});

test("the same names are not run twice", () => {
  assert.deepEqual(decideAutoGenerate({ ...opened, layout: "none", lastRunKey: "A" }), { run: false });
  assert.deepEqual(decideAutoGenerate({ ...opened, namesKey: "B", lastRunKey: "B", layout: "stale" }), { run: false });
});

test("returning to the opened names after another run generates again", () => {
  const back = { ...opened, lastRunKey: "B", layout: "stale" as const };
  assert.deepEqual(decideAutoGenerate(back), { run: true, delayMs: 0 });
});

const solved = (id: string) => ({ layout: { id } }) as unknown as SolvedLayout;
const result = (over: Partial<SolveResult>) => ({ seed: 1, layouts: [], nameProblems: [], ...over }) as unknown as SolveResult;

test("the first arrangement in the list is selected", () => {
  const picked = firstArrangement(result({ layouts: [solved("one"), solved("two")] }));
  assert.equal(picked?.layout.id, "one");
});

test("nothing is selected on failure or an empty list", () => {
  assert.equal(firstArrangement(result({ layouts: [solved("one")], failure: { message: "no" } as never })), null);
  assert.equal(firstArrangement(result({})), null);
});
