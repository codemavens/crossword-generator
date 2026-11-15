import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join } from "node:path";
import { inspectFont, cleanFontName } from "../../../src/core/typography/inspectFont.ts";
import { MAX_FONT_NAME_LENGTH } from "../../../src/core/api.ts";

const fontsDir = join(import.meta.dirname, "../../../public/fonts");

function load(file: string): ArrayBuffer {
  const b = readFileSync(join(fontsDir, file));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

const pacifico = load("Pacifico-Regular.ttf");
const zilla = load("ZillaSlab-SemiBold.ttf");

function withTag(tag: string, size = 2048): ArrayBuffer {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < 4; i++) bytes[i] = tag.charCodeAt(i);
  return bytes.buffer;
}

// Minimal WOFF 1.0 encoder: zlib-compresses each sfnt table.
function toWoff(sfnt: ArrayBuffer): ArrayBuffer {
  const src = new DataView(sfnt);
  const numTables = src.getUint16(4);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const offset = src.getUint32(rec + 8);
    const length = src.getUint32(rec + 12);
    const orig = new Uint8Array(sfnt, offset, length);
    const deflated = new Uint8Array(deflateSync(orig));
    tables.push({
      tag: src.getUint32(rec),
      checksum: src.getUint32(rec + 4),
      origLength: length,
      data: deflated.length < length ? deflated : orig,
    });
  }
  const pad4 = (n: number) => (n + 3) & ~3;
  let offset = 44 + numTables * 20;
  const offsets = tables.map((t) => {
    const at = offset;
    offset += pad4(t.data.length);
    return at;
  });
  const out = new Uint8Array(offset);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x774f4646); // wOFF
  view.setUint32(4, src.getUint32(0));
  view.setUint32(8, offset);
  view.setUint16(12, numTables);
  view.setUint32(16, sfnt.byteLength);
  tables.forEach((t, i) => {
    const rec = 44 + i * 20;
    view.setUint32(rec, t.tag);
    view.setUint32(rec + 4, offsets[i]!);
    view.setUint32(rec + 8, t.data.length);
    view.setUint32(rec + 12, t.origLength);
    view.setUint32(rec + 16, t.checksum);
    out.set(t.data, offsets[i]!);
  });
  return out.buffer;
}

test("accepts both bundled fonts with their own names", () => {
  assert.deepEqual(inspectFont(pacifico), { ok: true, name: "Pacifico Regular", format: "ttf" });
  assert.deepEqual(inspectFont(zilla), { ok: true, name: "Zilla Slab SemiBold", format: "ttf" });
});

test("refuses WOFF, even a well-formed one, before parsing", () => {
  const woff = toWoff(zilla);
  assert.equal(new TextDecoder().decode(new Uint8Array(woff, 0, 4)), "wOFF");
  const result = inspectFont(woff);
  assert.ok(!result.ok && /WOFF fonts are not supported/.test(result.message));
});

test("refuses empty, random and truncated data without throwing", () => {
  const random = new Uint8Array(4096);
  for (let i = 0; i < random.length; i++) random[i] = (i * 2654435761) >>> 24;
  for (const bytes of [new ArrayBuffer(0), new ArrayBuffer(3), random.buffer, pacifico.slice(0, 2000)]) {
    const result = inspectFont(bytes);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.message.length > 0);
  }
});

test("refuses a font cut short inside its glyph data", () => {
  for (const cut of [0.5, 0.9, 0.99]) {
    const result = inspectFont(zilla.slice(0, Math.floor(zilla.byteLength * cut)));
    assert.equal(result.ok, false, `cut at ${cut}`);
  }
});

test("refuses a valid header with garbage behind it", () => {
  for (const tag of ["\u0000\u0001\u0000\u0000", "OTTO", "true", "wOFF"]) {
    assert.equal(inspectFont(withTag(tag)).ok, false, JSON.stringify(tag));
  }
});

test("refuses WOFF2 and collections with a clear message", () => {
  const woff2 = inspectFont(withTag("wOF2"));
  assert.ok(!woff2.ok && /WOFF2/.test(woff2.message));
  const ttc = inspectFont(withTag("ttcf"));
  assert.ok(!ttc.ok && /collection/i.test(ttc.message));
});

test("font names are plain, trimmed and capped", () => {
  assert.equal(cleanFontName("  Foo\u0000\u0007Bar‮ \n"), "FooBar");
  assert.equal(cleanFontName(undefined), "Unnamed font");
  assert.equal(cleanFontName(" \u0001 "), "Unnamed font");
  assert.equal(cleanFontName("x".repeat(500)).length, MAX_FONT_NAME_LENGTH);
});
