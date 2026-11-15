import type { Font } from "opentype.js";
import { MAX_FONT_NAME_LENGTH } from "../api.ts";
import type { FontFormat } from "../api.ts";
import { parseFont, RENDER_OPTIONS } from "./opentypeFont.ts";

export type FontInspection =
  | { ok: true; name: string; format: FontFormat }
  | { ok: false; message: string };

const NOT_A_FONT = "This file is not a TrueType or OpenType font.";
const USE_TTF = "Use the TTF or OTF version of this font.";

// Exercises the same shaping path the outliner uses (substitution, kerning).
const SAMPLE_TEXT = "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 &'-.,!?";

function tagOf(bytes: ArrayBuffer): string {
  if (bytes.byteLength < 4) return "";
  return String.fromCharCode(...new Uint8Array(bytes, 0, 4));
}

// Format from the file's first four bytes, before any parsing.
function detectFormat(tag: string): FontFormat | { refused: string } {
  if (tag === "\u0000\u0001\u0000\u0000" || tag === "true") return "ttf";
  if (tag === "OTTO") return "otf";
  if (tag === "wOFF") return { refused: `WOFF fonts are not supported. ${USE_TTF}` };
  if (tag === "wOF2") return { refused: `WOFF2 fonts are not supported. ${USE_TTF}` };
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

// Builds every glyph outline (they are parsed lazily), so a stored font has no unread glyph data.
function outlinesReadable(font: Font): boolean {
  for (let i = 0; i < font.glyphs.length; i++) {
    const glyph = font.glyphs.get(i);
    if (!glyph || !Array.isArray(glyph.path.commands)) return false;
  }
  font.getPath(SAMPLE_TEXT, 0, 0, 72, RENDER_OPTIONS);
  font.getAdvanceWidth(SAMPLE_TEXT, 72, RENDER_OPTIONS);
  return true;
}

// Decides whether untrusted bytes are a usable font. Never throws, but can be slow on
// hostile input, so the service runs it in a worker with a time and memory limit.
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
