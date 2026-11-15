import { test } from "node:test";
import assert from "node:assert/strict";
import { isNodeVersionSupported } from "../../server/nodeVersion.ts";

test("accepts versions at or above the minimum", () => {
  assert.equal(isNodeVersionSupported("24.11.0"), true);
  assert.equal(isNodeVersionSupported("24.11.1"), true);
  assert.equal(isNodeVersionSupported("24.12.0"), true);
  assert.equal(isNodeVersionSupported("25.0.0"), true);
});

test("rejects older versions", () => {
  assert.equal(isNodeVersionSupported("24.10.9"), false);
  assert.equal(isNodeVersionSupported("22.20.0"), false);
  assert.equal(isNodeVersionSupported("20.0.0"), false);
});

test("compares numerically, not lexically", () => {
  assert.equal(isNodeVersionSupported("100.0.0"), true);
  assert.equal(isNodeVersionSupported("24.9.0"), false);
  assert.equal(isNodeVersionSupported("9.0.0", "10.0.0"), false);
});
