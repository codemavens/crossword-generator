import { test } from "node:test";
import assert from "node:assert/strict";
import { makeProjectFile, parseProjectImport } from "../../../src/core/models/projectImport.ts";
import { newProject } from "../../../src/core/models/defaults.ts";
import { MAX_NAMES } from "../../../src/core/models/validation.ts";
import { overlappingArt, solved } from "../export/fixtures.ts";

const project = {
  ...newProject(),
  id: "old-id",
  projectName: "Smith",
  familyName: "Smith",
  names: solved.names,
  artwork: [overlappingArt],
  selectedLayout: solved.layout,
};
const envelope = (over: Record<string, unknown> = {}) => JSON.stringify({ ...makeProjectFile(project), ...over });
const messages = (text: string): string[] => {
  const r = parseProjectImport(text);
  assert.equal(r.ok, false);
  return r.ok ? [] : r.messages;
};

test("a valid envelope imports with a blank id", () => {
  const r = parseProjectImport(envelope());
  assert.ok(r.ok);
  assert.equal(r.project.id, "");
  assert.equal(r.project.projectName, "Smith");
  assert.deepEqual(r.project.selectedLayout, solved.layout);
  assert.deepEqual(r.project.artwork, [overlappingArt]);
});

test("a bare project object is accepted", () => {
  const r = parseProjectImport(JSON.stringify(project));
  assert.ok(r.ok);
  assert.equal(r.project.id, "");
});

test("wrong format and future or odd versions are refused", () => {
  assert.match(messages(envelope({ format: "other" }))[0]!, /not a Sloth & Llama/);
  assert.match(messages(envelope({ formatVersion: 2 }))[0]!, /newer version/);
  assert.match(messages(envelope({ formatVersion: "1" }))[0]!, /not supported/);
});

test("not JSON, and JSON that is not an object", () => {
  assert.match(messages("{nope")[0]!, /not valid JSON/);
  for (const text of ["[]", "null", "42", '"x"', "true"]) assert.match(messages(text)[0]!, /does not contain a project/);
  assert.match(messages(envelope({ project: [] }))[0]!, /does not contain a project/);
});

test("missing fields give the first few messages only", () => {
  const m = messages(JSON.stringify({ projectName: "" }));
  assert.ok(m.some((x) => x.includes("settings")));
  const bad = messages(JSON.stringify({ ...project, projectName: "", names: "x", settings: { ...project.settings, tileSizeMm: -1 } }));
  assert.ok(bad.length >= 2 && bad.length <= 7);
});

test("too many names is refused", () => {
  const names = Array.from({ length: MAX_NAMES + 1 }, (_, i) => ({ id: `n${i}`, text: "ANNA" }));
  assert.ok(messages(JSON.stringify({ ...project, names, selectedLayout: undefined })).join("\n").includes("At most"));
});

test("raw svg artwork is dropped and unknown top-level fields are ignored", () => {
  const evil = { id: "up-x", name: "x", source: "custom", svg: "<svg><script>alert(1)</script></svg>" };
  const r = parseProjectImport(JSON.stringify({ ...project, artwork: [evil], script: "<script>", selectedLayout: undefined }));
  assert.ok(r.ok);
  assert.deepEqual(r.project.artwork, []);
  assert.equal("script" in r.project, false);
  assert.ok(!JSON.stringify(r.project).includes("<script"));
});

test("a tile pointing at an artwork that does not exist is refused or reset, never kept", () => {
  const layout = {
    ...solved.layout,
    decorativeTiles: [
      { id: "d1", position: { x: 50, y: 50 }, artworkId: "up-missing", source: "manual", purpose: "decoration", anchor: { nameId: solved.names[0]!.id, end: "start" } },
    ],
  };
  const r = parseProjectImport(JSON.stringify({ ...project, artwork: [], selectedLayout: layout }));
  if (r.ok) assert.ok(r.project.selectedLayout!.decorativeTiles.every((t) => t.artworkId !== "up-missing"));
});

test("script-like text in names is refused by name validation", () => {
  const names = [{ id: "n1", text: "<script>alert(1)</script>" }];
  assert.ok(messages(JSON.stringify({ ...project, names, selectedLayout: undefined })).join("\n").includes("names.0.text"));
});

test("__proto__ and constructor keys are dropped and pollute nothing", () => {
  const text = envelope().replace(
    '"project":{',
    '"project":{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},',
  );
  assert.ok(text.includes("__proto__"));
  const r = parseProjectImport(text);
  assert.ok(r.ok);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.getPrototypeOf(r.project), Object.prototype);
  assert.equal(Object.hasOwn(r.project, "__proto__"), false);
  assert.equal(Object.hasOwn(r.project, "constructor"), false);
  const nested = parseProjectImport(
    JSON.stringify({ ...project }).replace('"settings":{', '"settings":{"__proto__":{"polluted":true},'),
  );
  assert.ok(nested.ok);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.hasOwn(nested.project.settings, "__proto__"), false);
});

test("older projects get current defaults on import", () => {
  const { export: _e, lettering: _l, ...settings } = project.settings;
  const r = parseProjectImport(JSON.stringify({ ...project, settings }));
  assert.ok(r.ok);
  assert.ok(r.project.settings.export.cutColour);
});
