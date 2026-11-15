import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  confirmsAction,
  deleteProjectConfirm,
  isBackdropClick,
  removeFontConfirm,
} from "../../src/app/confirmations.ts";

const APP_DIR = join(import.meta.dirname, "../../src/app");

test("the dialog asks the same questions as the browser confirmations did", () => {
  assert.equal(deleteProjectConfirm("Okafor Anniversary").question, 'Delete project "Okafor Anniversary"? This cannot be undone.');
  assert.equal(
    removeFontConfirm("Lobster").question,
    'Remove "Lobster" from the font library? Projects that use it will need another font.',
  );
  assert.equal(deleteProjectConfirm("x").confirmLabel, "Delete project");
  assert.equal(removeFontConfirm("x").confirmLabel, "Remove font");
});

test("only the destructive button confirms; Cancel, Escape and the backdrop do nothing", () => {
  assert.equal(confirmsAction("confirm"), true);
  assert.equal(confirmsAction("cancel"), false);
  assert.equal(confirmsAction("escape"), false);
  assert.equal(confirmsAction("backdrop"), false);
});

test("a click outside the dialog box counts as a backdrop click", () => {
  const box = { left: 100, top: 100, right: 400, bottom: 300 };
  assert.equal(isBackdropClick(box, 250, 200), false);
  assert.equal(isBackdropClick(box, 100, 300), false);
  assert.equal(isBackdropClick(box, 99, 200), true);
  assert.equal(isBackdropClick(box, 250, 301), true);
});

test("the app no longer uses the browser's own confirm", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name)) files.push(path);
    }
  };
  walk(APP_DIR);
  const users = files.filter((f) => /window\.confirm\s*\(/.test(readFileSync(f, "utf8")));
  assert.deepEqual(users, []);
});

test("the dialog is a native modal dialog that focuses Cancel and acts only on its buttons", () => {
  const source = readFileSync(join(APP_DIR, "components/ConfirmDialog.tsx"), "utf8");
  assert.match(source, /<dialog/);
  assert.match(source, /showModal\(\)/);
  assert.match(source, /cancelRef\.current\?\.focus\(\)/);
  // No form submission, so Enter never confirms by default.
  assert.doesNotMatch(source, /<form|method="dialog"|type="submit"/);
});
