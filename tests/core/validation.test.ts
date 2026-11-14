import { test } from "node:test";
import assert from "node:assert/strict";
import {
  characterCount,
  validateNameText,
  validateProject,
} from "../../src/core/models/validation.ts";
import { newProject } from "../../src/core/models/defaults.ts";

function valid() {
  return { ...newProject(), projectName: "Smith", familyName: "Smith" };
}

test("validateNameText rejects one character and accepts two", () => {
  assert.notEqual(validateNameText("A"), null);
  assert.equal(validateNameText("Al"), null);
});

test("validateNameText rejects whitespace-only and trims", () => {
  assert.notEqual(validateNameText("   "), null);
  assert.notEqual(validateNameText(" A "), null);
  assert.equal(validateNameText(" Al "), null);
});

test("validateNameText counts graphemes", () => {
  assert.equal(characterCount("é"), 1);
  assert.notEqual(validateNameText("é"), null);
  assert.notEqual(validateNameText("\u{1F600}"), null);
  assert.equal(validateNameText("\u{1F600}\u{1F600}"), null);
  assert.equal(validateNameText("éa"), null);
});

test("validateNameText rejects over-long names", () => {
  assert.notEqual(validateNameText("a".repeat(201)), null);
});

test("validateProject accepts a valid project", () => {
  const project = { ...valid(), names: [{ id: "1", text: "Al" }, { id: "2", text: "Bo" }] };
  assert.deepEqual(validateProject(project), []);
});

test("validateProject flags a short name with its path", () => {
  const issues = validateProject({ ...valid(), names: [{ id: "1", text: "Al" }, { id: "2", text: "B" }] });
  assert.deepEqual(issues.map((i) => i.field), ["names.1.text"]);
});

test("validateProject flags duplicate ids", () => {
  const issues = validateProject({ ...valid(), names: [{ id: "1", text: "Al" }, { id: "1", text: "Bo" }] });
  assert.ok(issues.some((i) => i.field === "names.1.id"));
});

test("validateProject rejects non-object input", () => {
  for (const input of [null, undefined, "x", 5, [], true]) {
    const issues = validateProject(input);
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.field, "");
  }
});

test("validateProject requires a project name", () => {
  const issues = validateProject({ ...valid(), projectName: "   " });
  assert.ok(issues.some((i) => i.field === "projectName"));
});
