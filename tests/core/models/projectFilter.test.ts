import { test } from "node:test";
import assert from "node:assert/strict";
import { filterProjects } from "../../../src/core/models/projectFilter.ts";
import type { ProjectSummary } from "../../../src/core/api.ts";

const p = (id: string, projectName: string, customerName: string | null): ProjectSummary => ({
  id,
  projectName,
  customerName,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});
const list = [p("1", "Smith Family", "Ann Lee"), p("2", "Jones", null), p("3", "Sanders 2026", "Mike")];

test("empty or blank query keeps everything", () => {
  assert.equal(filterProjects(list, "").length, 3);
  assert.equal(filterProjects(list, "   ").length, 3);
});

test("matches project name or customer name, case-insensitively and trimmed", () => {
  assert.deepEqual(filterProjects(list, "  SMITH ").map((x) => x.id), ["1"]);
  assert.deepEqual(filterProjects(list, "lee").map((x) => x.id), ["1"]);
  assert.deepEqual(filterProjects(list, "mike").map((x) => x.id), ["3"]);
});

test("no match gives an empty list and null customers do not break it", () => {
  assert.deepEqual(filterProjects(list, "zzz"), []);
  assert.deepEqual(filterProjects(list, "null"), []);
});
