import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTO_GENERATE_DELAY_MS, decideAutoGenerate, firstArrangement } from "../../src/app/autoGenerate.ts";
import type { AutoGenerateFacts } from "../../src/app/autoGenerate.ts";
import type { SolveResult, SolvedLayout } from "../../src/core/solver/index.ts";

const opened: AutoGenerateFacts = { canGenerate: true, namesKey: "A", openedKey: "A", appliedKey: "A" };

test("a saved arrangement that matches its names is left alone on open", () => {
  assert.deepEqual(decideAutoGenerate(opened), { run: false });
});

test("opening with no arrangement, or one that no longer matches, generates at once", () => {
  assert.deepEqual(decideAutoGenerate({ ...opened, appliedKey: null }), { run: true, delayMs: 0 });
});

test("a name change generates after the pause, even over a matching arrangement", () => {
  assert.deepEqual(decideAutoGenerate({ ...opened, namesKey: "B" }), { run: true, delayMs: AUTO_GENERATE_DELAY_MS });
});

test("nothing runs while generation is impossible", () => {
  assert.deepEqual(decideAutoGenerate({ ...opened, canGenerate: false, appliedKey: null }), { run: false });
  assert.deepEqual(decideAutoGenerate({ ...opened, canGenerate: false, namesKey: "B" }), { run: false });
});

test("names whose arrangement is already applied are not run again", () => {
  assert.deepEqual(decideAutoGenerate({ ...opened, namesKey: "B", appliedKey: "B" }), { run: false });
});

test("returning to the opened names after an edit regenerates", () => {
  // A -> B applied B; back at A the arrangement is B's, however valid it looks.
  assert.deepEqual(decideAutoGenerate({ ...opened, appliedKey: "B" }), { run: true, delayMs: 0 });
});

test("a run by hand that selected nothing does not stop a later automatic run", () => {
  assert.deepEqual(decideAutoGenerate({ ...opened, namesKey: "B", appliedKey: null }), { run: true, delayMs: AUTO_GENERATE_DELAY_MS });
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
