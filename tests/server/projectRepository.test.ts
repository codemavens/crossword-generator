import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteProjectRepository } from "../../server/database/projectRepository.ts";
import { CURRENT_SCHEMA_VERSION, newProject } from "../../src/core/models/defaults.ts";

function sample(name: string, customer?: string) {
  const project = newProject();
  project.projectName = name;
  project.familyName = "Smith";
  if (customer) project.customerName = customer;
  return project;
}

const pause = () => new Promise((r) => setTimeout(r, 5));

test("create assigns id and timestamps and stores the id in the document", () => {
  const repo = new SqliteProjectRepository(":memory:");
  const record = repo.create(sample("Smith", "Ann"));
  assert.match(record.id, /^[0-9a-f-]{36}$/);
  assert.equal(record.project.id, record.id);
  assert.equal(record.createdAt, record.updatedAt);
  assert.equal(record.customerName, "Ann");
  assert.equal(record.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(repo.get(record.id), record);
  repo.close();
});

test("create ignores a client-supplied id and null customer is stored", () => {
  const repo = new SqliteProjectRepository(":memory:");
  const input = { ...sample("A"), id: "client-id" };
  const record = repo.create(input);
  assert.notEqual(record.id, "client-id");
  assert.equal(record.customerName, null);
  repo.close();
});

test("update forces the row id and bumps updatedAt only", async () => {
  const repo = new SqliteProjectRepository(":memory:");
  const created = repo.create(sample("Old"));
  await pause();
  const updated = repo.update(created.id, { ...sample("New"), id: "other" });
  assert.ok(updated);
  assert.equal(updated.id, created.id);
  assert.equal(updated.project.id, created.id);
  assert.equal(updated.projectName, "New");
  assert.equal(updated.createdAt, created.createdAt);
  assert.ok(updated.updatedAt > created.updatedAt);
  repo.close();
});

test("list returns newest updated first", async () => {
  const repo = new SqliteProjectRepository(":memory:");
  const a = repo.create(sample("A"));
  await pause();
  const b = repo.create(sample("B"));
  await pause();
  assert.deepEqual(repo.list().map((p) => p.id), [b.id, a.id]);
  repo.update(a.id, sample("A2"));
  assert.deepEqual(repo.list().map((p) => p.projectName), ["A2", "B"]);
  repo.close();
});

test("delete removes the project", () => {
  const repo = new SqliteProjectRepository(":memory:");
  const record = repo.create(sample("A"));
  assert.equal(repo.delete(record.id), true);
  assert.equal(repo.get(record.id), null);
  assert.deepEqual(repo.list(), []);
  repo.close();
});

test("missing ids return null/false", () => {
  const repo = new SqliteProjectRepository(":memory:");
  assert.equal(repo.get("nope"), null);
  assert.equal(repo.update("nope", sample("A")), null);
  assert.equal(repo.delete("nope"), false);
  repo.close();
});

test("data persists across reopening a file database", () => {
  const dir = mkdtempSync(join(tmpdir(), "sloth-repo-"));
  try {
    const path = join(dir, "nested", "projects.db");
    const first = new SqliteProjectRepository(path);
    const record = first.create(sample("Persisted"));
    first.close();
    const second = new SqliteProjectRepository(path);
    assert.deepEqual(second.get(record.id), record);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
