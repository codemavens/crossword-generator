import { test } from "node:test";
import assert from "node:assert/strict";
import { safeFileStem } from "../../../src/core/export/index.ts";

test("safeFileStem keeps letters, digits, - and _ and turns spaces into -", () => {
  assert.equal(safeFileStem("The Sanders 2026"), "The-Sanders-2026");
  assert.equal(safeFileStem("  Zoë & Renée's   gift_v2 "), "Zoe-Renees-gift_v2");
  assert.equal(safeFileStem("../../etc/passwd"), "etcpasswd");
  assert.equal(safeFileStem('<script>alert("x")</script>.svg'), "scriptalertxscriptsvg");
});

test("safeFileStem is never empty and at most 60 characters", () => {
  for (const s of ["", "   ", "!!!", "日本語", "---", "\u0000‮"]) assert.equal(safeFileStem(s), "design");
  const long = safeFileStem("a".repeat(100));
  assert.equal(long.length, 60);
  assert.ok(safeFileStem(`${"b".repeat(59)} c`).length <= 60);
  for (const s of ["x y", "Ünïcödé name", "a/b\\c:d*e?f"]) assert.match(safeFileStem(s), /^[A-Za-z0-9_-]{1,60}$/);
});
