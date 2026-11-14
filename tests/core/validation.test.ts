import { test } from "node:test";
import assert from "node:assert/strict";
import {
  characterCount,
  validateNameText,
  validateProject,
} from "../../src/core/models/validation.ts";
import { newProject, withCurrentDefaults } from "../../src/core/models/defaults.ts";
import type { NameArtProject } from "../../src/core/models/project.ts";

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
  // Emoji are not supported name characters (SPEC §5.3 amendment).
  assert.notEqual(validateNameText("\u{1F600}\u{1F600}"), null);
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

test("validateProject rejects missing or invalid settings", () => {
  const base = { ...newProject(), projectName: "P" };
  assert.deepEqual(validateProject(base), []);
  for (const tileSizeMm of [0, -1, Number.NaN, "12", 100000]) {
    const issues = validateProject({ ...base, settings: { ...base.settings, tileSizeMm } });
    assert.ok(issues.some((i) => i.field === "settings.tileSizeMm"), String(tileSizeMm));
  }
  const empty = validateProject({ ...base, settings: {} });
  assert.ok(empty.some((i) => i.field === "settings.frame"));
});

test("validateProject accepts the default frame settings", () => {
  assert.deepEqual(validateProject({ ...valid(), names: [] }), []);
});

test("validateProject accepts an old frame object missing the new fields", () => {
  const project = valid();
  const frame: Record<string, unknown> = { ...project.settings.frame };
  for (const key of ["bottomLineHeightMm", "crosswordClearanceMm", "bottomCornerRadiusMm", "yearFontSizeMm"]) {
    delete frame[key];
  }
  const old = { ...project, settings: { ...project.settings, frame } };
  assert.deepEqual(validateProject(old), []);
});

test("validateProject rejects bad frame values", () => {
  const project = valid();
  const bad = (patch: Record<string, unknown>) => {
    const settings = { ...project.settings, frame: { ...project.settings.frame, ...patch } };
    return validateProject({ ...project, settings }).map((i) => i.field);
  };
  assert.deepEqual(bad({ outerDiameterMm: 5, ringWidthMm: 1 }), ["settings.frame.outerDiameterMm"]);
  assert.deepEqual(bad({ ringWidthMm: 150 }), ["settings.frame.ringWidthMm"]);
  assert.deepEqual(bad({ ringWidthMm: 0 }), ["settings.frame.ringWidthMm"]);
  assert.deepEqual(bad({ familyNameFontSizeMm: 0 }), ["settings.frame.familyNameFontSizeMm"]);
  assert.deepEqual(bad({ contourSmoothness: 1.5 }), ["settings.frame.contourSmoothness"]);
  assert.deepEqual(bad({ nameBufferMm: -1 }), ["settings.frame.nameBufferMm"]);
  assert.deepEqual(bad({ bottomCornerRadiusMm: Number.NaN }), ["settings.frame.bottomCornerRadiusMm"]);
  assert.deepEqual(bad({ crosswordClearanceMm: "5" }), ["settings.frame.crosswordClearanceMm"]);
});

test("validateProject applies the frame cross-field rules", () => {
  const project = valid();
  const bad = (patch: Record<string, unknown>) => {
    const settings = { ...project.settings, frame: { ...project.settings.frame, ...patch } };
    return validateProject({ ...project, settings }).map((i) => i.field);
  };
  assert.deepEqual(bad({ ringWidthMm: 0.1 }), ["settings.frame.ringWidthMm"]);
  // Inner radius at 300 mm with an 8 mm ring is 142 mm.
  assert.deepEqual(bad({ ringWidthMm: 8, bottomLineHeightMm: 180 }), ["settings.frame.bottomLineHeightMm"]);
  assert.deepEqual(bad({ ringWidthMm: 8, bottomLineHeightMm: 142 }), []);
  assert.deepEqual(bad({ ringWidthMm: 8, bottomLineHeightMm: 26, nameDropMm: 40 }), ["settings.frame.nameDropMm"]);
  const old: Record<string, unknown> = { ...project.settings.frame, bottomLineHeightMm: 500 };
  delete old.outerDiameterMm;
  delete old.nameDropMm;
  const settings = { ...project.settings, frame: old };
  assert.deepEqual(validateProject({ ...project, settings }), []);
});

function withLayout(selectedLayout: unknown) {
  return { ...valid(), names: [{ id: "1", text: "Al" }], selectedLayout };
}

const GOOD_LAYOUT = {
  id: "layout-1-abc",
  seed: 1,
  placements: [{ nameId: "1", start: { x: 0, y: 0 }, direction: "horizontal" }],
  decorativeTiles: [
    {
      id: "d1",
      position: { x: 2, y: 0 },
      artworkId: null,
      source: "manual",
      purpose: "decoration",
      anchor: { nameId: "1", end: "end" },
    },
  ],
  offset: { xMm: 0, yMm: 0 },
};

test("validateProject accepts a well-formed selected layout", () => {
  assert.deepEqual(validateProject(withLayout(GOOD_LAYOUT)), []);
});

test("validateProject bound-checks the selected layout", () => {
  const fields = (layout: unknown) => validateProject(withLayout(layout)).map((i) => i.field);
  assert.deepEqual(fields("x"), ["selectedLayout"]);
  assert.deepEqual(fields({ ...GOOD_LAYOUT, placements: [{ nameId: "1", start: { x: 0.5, y: 0 }, direction: "horizontal" }] }), [
    "selectedLayout.placements.0",
  ]);
  assert.deepEqual(fields({ ...GOOD_LAYOUT, placements: [{ nameId: "1", start: { x: 1e9, y: 0 }, direction: "horizontal" }] }), [
    "selectedLayout.placements.0",
  ]);
  assert.deepEqual(fields({ ...GOOD_LAYOUT, placements: [{ nameId: "1", start: { x: 0, y: 0 }, direction: "up" }] }), [
    "selectedLayout.placements.0",
  ]);
  const many = Array.from({ length: 21 }, () => GOOD_LAYOUT.placements[0]);
  assert.deepEqual(fields({ ...GOOD_LAYOUT, placements: many }), ["selectedLayout.placements"]);
  assert.deepEqual(fields({ ...GOOD_LAYOUT, decorativeTiles: [{ ...GOOD_LAYOUT.decorativeTiles[0], anchor: null }] }), [
    "selectedLayout.decorativeTiles.0",
  ]);
  assert.deepEqual(fields({ ...GOOD_LAYOUT, decorativeTiles: undefined }), ["selectedLayout.decorativeTiles"]);
  assert.deepEqual(fields({ ...GOOD_LAYOUT, offset: { xMm: Number.NaN, yMm: 0 } }), ["selectedLayout.offset"]);
});

test("validateProject limits the number of names", () => {
  const names = Array.from({ length: 21 }, (_, i) => ({ id: String(i), text: "Al" }));
  assert.ok(validateProject({ ...valid(), names }).some((i) => i.field === "names"));
});

test("a project saved with the old connectors key still opens", () => {
  const { decorativeTiles: _, ...rest } = GOOD_LAYOUT;
  const old = { ...withLayout({ ...rest, connectors: [] }) } as unknown as NameArtProject;
  const upgraded = withCurrentDefaults(old);
  assert.deepEqual(upgraded.selectedLayout?.decorativeTiles, []);
  assert.equal("connectors" in upgraded.selectedLayout!, false);
  assert.deepEqual(validateProject(upgraded), []);
});
