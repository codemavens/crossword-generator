import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_NAME_LENGTH, normalizeNameText, validateNameText } from "../../../src/core/models/validation.ts";

function chars(text: string): string[] {
  const r = normalizeNameText(text);
  assert.ok(r.ok, `${text} should be accepted`);
  return r.chars;
}

function problem(text: string): string {
  const r = normalizeNameText(text);
  assert.ok(!r.ok, `${text} should be rejected`);
  return r.problem;
}

test("trims, uppercases and composes to NFC", () => {
  assert.deepEqual(chars("  anna "), ["A", "N", "N", "A"]);
  assert.deepEqual(chars("René"), ["R", "E", "N", "É"]);
  assert.deepEqual(chars("zoë"), ["Z", "O", "Ë"]);
  assert.deepEqual(chars("ŁUKASZ").length, 6);
});

test("curly apostrophes and hyphen variants match the plain forms", () => {
  assert.deepEqual(chars("O’Brien"), chars("O'Brien"));
  assert.deepEqual(chars("Anne‐Marie"), chars("Anne-Marie"));
  assert.deepEqual(chars("Anne–Marie"), chars("Anne-Marie"));
});

test("rejects short names, spaces and unsupported characters", () => {
  assert.equal(problem("A"), "too-short");
  assert.equal(problem(" É "), "too-short");
  assert.equal(problem("Mary Ann"), "spaces");
  assert.match(validateNameText("Mary Ann")!, /MARY-ANN/);
  assert.equal(problem("Al3x"), "unsupported");
  assert.equal(problem("\u{1F600}\u{1F600}"), "unsupported");
  assert.equal(problem("Straße"), "unsupported");
  assert.equal(problem("IvanЖ"), "unsupported");
  // Q with an acute accent has no precomposed form, so the mark stays separate.
  assert.equal(problem("Q́a"), "unsupported");
});

test("limits name length", () => {
  assert.equal(chars("A".repeat(MAX_NAME_LENGTH)).length, MAX_NAME_LENGTH);
  assert.equal(problem("A".repeat(MAX_NAME_LENGTH + 1)), "too-long");
});
