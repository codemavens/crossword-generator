import { test } from "node:test";
import assert from "node:assert/strict";
import { duplicateProject } from "../../../src/core/models/duplicate.ts";
import { newProject } from "../../../src/core/models/defaults.ts";
import { MAX_TEXT_LENGTH, validateProject } from "../../../src/core/models/validation.ts";
import { overlappingArt, solved } from "../export/fixtures.ts";

const source = {
  ...newProject(),
  id: "abc",
  projectName: "Smith",
  customerName: "Ann",
  familyName: "Smith",
  names: solved.names,
  artwork: [overlappingArt],
  selectedLayout: { ...solved.layout, offset: { xMm: 3, yMm: -2 } },
};

test("copy has a blank id (never the source id), a marked name and is otherwise identical", () => {
  const copy = duplicateProject(source);
  assert.equal(copy.id, "");
  assert.equal(copy.projectName, "Smith (copy)");
  assert.deepEqual({ ...copy, id: source.id, projectName: source.projectName }, source);
  assert.deepEqual(validateProject(copy), []);
});

test("copy is independent of the original", () => {
  const copy = duplicateProject(source);
  copy.names[0]!.text = "CHANGED";
  copy.selectedLayout!.offset.xMm = 99;
  copy.settings.frame.outerDiameterMm = 123;
  assert.notEqual(source.names[0]!.text, "CHANGED");
  assert.equal(source.selectedLayout.offset.xMm, 3);
  assert.notEqual(source.settings.frame.outerDiameterMm, 123);
  assert.equal(source.projectName, "Smith");
});

test("a long name is trimmed so the copy stays valid", () => {
  const copy = duplicateProject({ ...source, projectName: "x".repeat(MAX_TEXT_LENGTH) });
  assert.equal(copy.projectName.length, MAX_TEXT_LENGTH);
  assert.ok(copy.projectName.endsWith(" (copy)"));
  assert.deepEqual(validateProject(copy), []);
});
