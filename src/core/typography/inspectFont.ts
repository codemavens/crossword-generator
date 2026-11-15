import type { Font } from "opentype.js";
import { MAX_FONT_NAME_LENGTH } from "../api.ts";
import type { FontFormat } from "../api.ts";
import { parseFont } from "./opentypeFont.ts";

export type FontInspection =
  | { ok: true; name: string; format: FontFormat }
  | { ok: false; message: string };

const NOT_A_FONT = "This file is not a TrueType, OpenType or WOFF font.";

function tagOf(bytes: ArrayBuffer): string {
  if (bytes.byteLength < 4) return "";
  return String.fromCharCode(...new Uint8Array(bytes, 0, 4));
}

// Format from the file's first four bytes, before any parsing.
function detectFormat(tag: string): FontFormat | { refused: string } {
  if (tag === "\u0000\u0001\u0000\u0000" || tag === "true") return "ttf";
  if (tag === "OTTO") return "otf";
  if (tag === "wOFF") return "woff";
  if (tag === "wOF2") return { refused: "WOFF2 fonts are not supported. Use the TTF or OTF version of this font." };
  if (tag === "ttcf") return { refused: "Font collections (.ttc) are not supported. Use a single TTF or OTF font." };
  return { refused: NOT_A_FONT };
}

// Strips control and bidi-override characters and caps the length for display as plain text.
export function cleanFontName(raw: string | undefined): string {
  const cleaned = (raw ?? "").replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, "").trim();
  return Array.from(cleaned).slice(0, MAX_FONT_NAME_LENGTH).join("").trim() || "Unnamed font";
}

function displayName(font: Font): string {
  const full = font.getEnglishName("fullName")?.trim();
  if (full) return cleanFontName(full);
  const family = font.getEnglishName("fontFamily")?.trim() ?? "";
  const sub = font.getEnglishName("fontSubfamily")?.trim() ?? "";
  return cleanFontName(`${family} ${sub}`);
}

// Touches the first and last few outlines so a file cut short inside the glyph data is caught.
function outlinesReadable(font: Font): boolean {
  const count = font.glyphs.length;
  const sample = new Set<number>();
  for (let i = 0; i < Math.min(count, 8); i++) sample.add(i);
  for (let i = Math.max(0, count - 8); i < count; i++) sample.add(i);
  for (const index of sample) {
    const glyph = font.glyphs.get(index);
    if (!glyph || !Array.isArray(glyph.path.commands)) return false;
  }
  return true;
}

// Decides whether untrusted bytes are a usable font. Never throws.
export function inspectFont(bytes: ArrayBuffer): FontInspection {
  const format = detectFormat(tagOf(bytes));
  if (typeof format !== "string") return { ok: false, message: format.refused };
  try {
    const font = parseFont(bytes);
    const upm = font.unitsPerEm;
    if (!Number.isFinite(upm) || upm < 16 || upm > 16384) {
      return { ok: false, message: "This font has an invalid units-per-em value." };
    }
    if (!(font.glyphs.length > 0)) return { ok: false, message: "This font contains no glyphs." };
    if (!outlinesReadable(font)) return { ok: false, message: "This font's glyph outlines cannot be read." };
    return { ok: true, name: displayName(font), format };
  } catch {
    return { ok: false, message: "This font file is damaged or could not be read." };
  }
}
