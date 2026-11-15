import type { FontSummary } from "../core/api.ts";
import { isLibraryFontId } from "../core/api.ts";
import type { FontOutliner } from "../core/geometry/types.ts";
import { createFontOutliner } from "../core/typography/opentypeFont.ts";
import { ApiRequestError, api } from "./api/client.ts";

export interface FontEntry {
  id: string;
  label: string;
  url: string;
}

// Bundled fonts; add more here. Fonts the user adds live in the local library instead.
export const FONTS: FontEntry[] = [
  { id: "pacifico", label: "Pacifico", url: "/fonts/Pacifico-Regular.ttf" },
  { id: "zilla-slab-semibold", label: "Zilla Slab SemiBold", url: "/fonts/ZillaSlab-SemiBold.ttf" },
];

export const DEFAULT_NAME_FONT_ID = "pacifico";
export const DEFAULT_YEAR_FONT_ID = "zilla-slab-semibold";
export { DEFAULT_TILE_FONT_ID } from "../core/models/defaults.ts";

export interface FontOption {
  id: string;
  label: string;
  library: boolean;
}

export function isBundledFontId(id: string): boolean {
  return FONTS.some((f) => f.id === id);
}

// One list for every picker: bundled fonts first, then library fonts by name.
export function fontOptions(library: readonly FontSummary[]): FontOption[] {
  const bundled = FONTS.map((f) => ({ id: f.id, label: f.label, library: false }));
  const added = [...library]
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((f) => ({ id: f.id, label: f.name, library: true }));
  return [...bundled, ...added];
}

// A font id that is neither bundled nor in the library (removed, or the library could not be read).
export class MissingFontError extends Error {
  readonly fontId: string;
  constructor(fontId: string, reason: string) {
    super(reason);
    this.fontId = fontId;
  }
}

const cache = new Map<string, Promise<FontOutliner>>();

async function fetchFont(id: string): Promise<FontOutliner> {
  const entry = FONTS.find((f) => f.id === id);
  if (entry) {
    const res = await fetch(entry.url);
    if (!res.ok) throw new Error(`Could not load font "${entry.label}" (HTTP ${res.status}).`);
    return createFontOutliner(id, await res.arrayBuffer());
  }
  if (!isLibraryFontId(id)) throw new MissingFontError(id, "Unknown font.");
  let bytes: ArrayBuffer;
  try {
    bytes = await api.getFontBytes(id);
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 400)) {
      throw new MissingFontError(id, "The font is not in the font library.");
    }
    throw new MissingFontError(id, "The font library could not be reached.");
  }
  try {
    return createFontOutliner(id, bytes);
  } catch {
    throw new MissingFontError(id, "The stored font could not be read.");
  }
}

export function loadFont(id: string): Promise<FontOutliner> {
  const cached = cache.get(id);
  if (cached) return cached;
  const promise = fetchFont(id);
  // Do not cache failures, so a retry can succeed.
  promise.catch(() => {
    if (cache.get(id) === promise) cache.delete(id);
  });
  cache.set(id, promise);
  return promise;
}

// Drops a removed library font so it is not drawn from memory afterwards.
export function forgetFont(id: string): void {
  cache.delete(id);
}
