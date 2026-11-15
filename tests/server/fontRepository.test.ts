import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteFontRepository } from "../../server/database/fontRepository.ts";
import { SqliteProjectRepository } from "../../server/database/projectRepository.ts";
import type { FontSummary } from "../../src/core/api.ts";

function summary(id: string, name: string, size = 3): FontSummary {
  return { id, name, format: "ttf", sizeBytes: size, addedAt: "2026-11-14T00:00:00.000Z" };
}

const ID_A = `lib-${"a".repeat(32)}`;
const ID_B = `lib-${"b".repeat(32)}`;

test("add, list sorted by name, get, count and remove", () => {
  const repo = new SqliteFontRepository(":memory:");
  assert.deepEqual(repo.list(), []);
  assert.equal(repo.add(summary(ID_A, "zeta"), new Uint8Array([1, 2, 3])), "added");
  assert.equal(repo.add(summary(ID_B, "Alpha", 2), new Uint8Array([9, 8])), "added");
  assert.equal(repo.count(), 2);
  assert.deepEqual(
    repo.list().map((f) => f.name),
    ["Alpha", "zeta"],
  );
  assert.equal("bytes" in (repo.list()[0] as object), false);

  const got = repo.get(ID_A);
  assert.ok(got);
  assert.deepEqual(got.summary, summary(ID_A, "zeta"));
  assert.deepEqual(Array.from(got.bytes), [1, 2, 3]);
  assert.equal(repo.get(`lib-${"c".repeat(32)}`), null);

  assert.equal(repo.remove(ID_A), true);
  assert.equal(repo.remove(ID_A), false);
  assert.equal(repo.count(), 1);
  repo.close();
});

test("adding the same id again keeps the first copy", () => {
  const repo = new SqliteFontRepository(":memory:");
  assert.equal(repo.add(summary(ID_A, "First"), new Uint8Array([1])), "added");
  assert.equal(repo.add(summary(ID_A, "Second"), new Uint8Array([2])), "exists");
  assert.equal(repo.count(), 1);
  assert.equal(repo.get(ID_A)?.summary.name, "First");
  assert.deepEqual(Array.from(repo.get(ID_A)?.bytes ?? []), [1]);
  repo.close();
});

test("fonts live in the same database file as projects and survive reopening", () => {
  const dir = mkdtempSync(join(tmpdir(), "sloth-fonts-"));
  try {
    const path = join(dir, "nested", "projects.db");
    const projects = new SqliteProjectRepository(path);
    const fonts = new SqliteFontRepository(path);
    fonts.add(summary(ID_A, "Kept"), new Uint8Array([7, 7]));
    fonts.close();
    projects.close();

    const reopened = new SqliteFontRepository(path);
    assert.deepEqual(Array.from(reopened.get(ID_A)?.bytes ?? []), [7, 7]);
    reopened.close();
    const projectsAgain = new SqliteProjectRepository(path);
    assert.deepEqual(projectsAgain.list(), []);
    projectsAgain.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
