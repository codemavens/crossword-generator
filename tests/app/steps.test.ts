import { test } from "node:test";
import assert from "node:assert/strict";
import { blockerStep, nextStep, STEP_IDS, stepCompletion, stepStates } from "../../src/app/steps.ts";
import type { StepFacts, StepId, ViewId } from "../../src/app/steps.ts";

// A saved project with every step done.
const finished: StepFacts = {
  projectName: "Sanders family",
  nameCount: 7,
  namesInvalid: false,
  arrangementChosen: true,
  arrangementStale: false,
  arrangementRank: null,
  fontsLoading: false,
  fontsFailed: false,
  missingFontCount: 0,
  fontNames: ["Pacifico", "Zilla Slab SemiBold", "Zilla Slab SemiBold"],
  frameFieldProblem: false,
  frameBuilt: true,
  outerDiameterMm: 300,
  tileSizeValid: true,
  letterSizeValid: true,
  tileSizeMm: 16,
  exportReady: true,
};

// A brand-new project: no name, no names, nothing chosen.
const fresh: StepFacts = { ...finished, projectName: "", nameCount: 0, arrangementChosen: false, exportReady: false };

const byId = (f: StepFacts, current: ViewId = "projects") =>
  Object.fromEntries(stepStates(f, current).map((s) => [s.id, s])) as Record<StepId, ReturnType<typeof stepStates>[number]>;
const openable = (f: StepFacts, current: ViewId = "projects") =>
  stepStates(f, current).filter((s) => s.openable).map((s) => s.id);

test("steps are listed in the agreed order", () => {
  assert.deepEqual([...STEP_IDS], ["details", "arrangement", "fonts", "frame", "tiles", "export"]);
  assert.deepEqual(stepStates(fresh, "projects").map((s) => s.number), [1, 2, 3, 4, 5, 6]);
  assert.equal(nextStep("details"), "arrangement");
  assert.equal(nextStep("tiles"), "export");
  assert.equal(nextStep("export"), null);
});

test("Details is complete with a project name, at least one name and no invalid name; saving is not needed", () => {
  assert.equal(stepCompletion({ ...finished, projectName: "  " }).details, false);
  assert.equal(stepCompletion({ ...finished, nameCount: 0 }).details, false);
  assert.equal(stepCompletion({ ...finished, namesInvalid: true }).details, false);
  assert.equal(stepCompletion(finished).details, true);
});

test("Arrangement is complete only when one is chosen and still matches the names", () => {
  assert.equal(stepCompletion({ ...finished, arrangementChosen: false }).arrangement, false);
  assert.equal(stepCompletion({ ...finished, arrangementStale: true }).arrangement, false);
  assert.equal(stepCompletion(finished).arrangement, true);
});

test("Fonts are complete when all three are loaded and available", () => {
  assert.equal(stepCompletion({ ...finished, fontsLoading: true }).fonts, false);
  assert.equal(stepCompletion({ ...finished, fontsFailed: true }).fonts, false);
  assert.equal(stepCompletion({ ...finished, missingFontCount: 1 }).fonts, false);
  assert.equal(stepCompletion(finished).fonts, true);
});

test("Frame is complete with no field error and a built frame; Tiles with valid sizes", () => {
  assert.equal(stepCompletion({ ...finished, frameFieldProblem: true }).frame, false);
  assert.equal(stepCompletion({ ...finished, frameBuilt: false }).frame, false);
  assert.equal(stepCompletion({ ...finished, tileSizeValid: false }).tiles, false);
  assert.equal(stepCompletion({ ...finished, letterSizeValid: false }).tiles, false);
});

test("a new project opens only Details; each completed step unlocks the next one", () => {
  assert.deepEqual(openable(fresh), ["details"]);
  const named = { ...fresh, projectName: "Smith", nameCount: 3 };
  assert.deepEqual(openable(named), ["details", "arrangement"]);
  const chosen = { ...named, arrangementChosen: true };
  assert.deepEqual(openable(chosen), ["details", "arrangement", "fonts", "frame", "tiles", "export"]);
  const badFrame = { ...chosen, frameBuilt: false };
  assert.deepEqual(openable(badFrame), ["details", "arrangement", "fonts", "frame"]);
});

test("a locked step names the first earlier step that needs attention", () => {
  const s = byId({ ...fresh, projectName: "Smith", nameCount: 3 });
  assert.equal(s.arrangement.blockedBy, null);
  assert.equal(s.fonts.unlocked, false);
  assert.equal(s.fonts.blockedBy, "arrangement");
  assert.equal(s.export.blockedBy, "arrangement");
  assert.equal(byId(fresh).arrangement.blockedBy, "details");
});

test("a finished project unlocks every step, whichever view is showing", () => {
  for (const view of ["projects", ...STEP_IDS] as ViewId[]) {
    assert.deepEqual(openable(finished, view), [...STEP_IDS]);
  }
  assert.ok(stepStates(finished, "details").slice(0, 5).every((s) => s.complete));
});

test("the current step and every earlier step stay openable when a change elsewhere locks them", () => {
  // A font removed from the library while Tiles is showing.
  const fontGone = { ...finished, missingFontCount: 1 };
  const s = byId(fontGone, "tiles");
  assert.equal(s.frame.unlocked, false);
  assert.equal(s.frame.openable, true);
  assert.equal(s.tiles.openable, true);
  assert.equal(s.export.openable, false);
  assert.equal(s.export.blockedBy, "fonts");
  assert.equal(s.fonts.attention, true);
  assert.equal(s.details.attention, false);
  // From Projects the same project only opens up to Fonts.
  assert.deepEqual(openable(fontGone), ["details", "arrangement", "fonts"]);
});

test("AC8a: fonts that fail to load with no arrangement chosen still leave Fonts openable", () => {
  const failed = { ...fresh, projectName: "Smith", nameCount: 3, fontsFailed: true, frameBuilt: false };
  const s = byId(failed);
  assert.equal(s.fonts.unlocked, true);
  assert.equal(s.fonts.blockedBy, null);
  assert.equal(s.frame.unlocked, false);
  assert.equal(s.frame.blockedBy, "arrangement");
  // Not while Details itself is incomplete.
  assert.equal(byId({ ...failed, nameCount: 0 }).fonts.unlocked, false);
});

test("rail summaries describe each step's state", () => {
  const summaries = (f: StepFacts) => stepStates(f, "details").map((s) => s.summary);
  assert.deepEqual(summaries(finished), ["7 names", "Chosen", "Pacifico · Zilla Slab SemiBold", "300 mm", "16 mm", "Ready"]);
  assert.equal(summaries({ ...fresh, nameCount: 1 })[0], "1 name");
  assert.equal(summaries(fresh)[1], "None chosen");
  assert.equal(summaries(fresh)[5], "Not ready");
  assert.equal(summaries({ ...finished, arrangementRank: { index: 0, count: 3 } })[1], "#1 of 3 chosen");
  assert.equal(summaries({ ...finished, outerDiameterMm: 312.345, tileSizeMm: 15.25 })[3], "312.3 mm");
});

test("each export blocker names the step that fixes it", () => {
  assert.equal(blockerStep("fonts"), "fonts");
  assert.equal(blockerStep("frame-failed"), "frame");
  assert.equal(blockerStep("frame-unusable"), "frame");
  assert.equal(blockerStep("no-layout"), "arrangement");
  assert.equal(blockerStep("layout-invalid"), "arrangement");
  assert.equal(blockerStep("crossword-problem"), "tiles");
  assert.equal(blockerStep("crossword-problem", true), "fonts");
  assert.equal(blockerStep("crossword-failed"), "tiles");
});

test("workflow: a new project walks the rail from Details to Export", () => {
  let f: StepFacts = fresh;
  const lastOpen = () => openable(f).at(-1);
  assert.equal(lastOpen(), "details");
  f = { ...f, projectName: "Sanders family", nameCount: 7 };
  assert.equal(lastOpen(), "arrangement");
  f = { ...f, arrangementChosen: true, arrangementRank: { index: 1, count: 4 } };
  assert.equal(lastOpen(), "export");
  assert.equal(byId(f).export.summary, "Not ready");
  f = { ...f, exportReady: true };
  assert.equal(byId(f).export.summary, "Ready");
  // Editing a name afterwards invalidates the arrangement and locks the later steps again.
  f = { ...f, arrangementStale: true, exportReady: false };
  assert.equal(lastOpen(), "arrangement");
  assert.equal(byId(f, "export").arrangement.attention, true);
});
