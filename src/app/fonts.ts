import type { FontOutliner } from "../core/geometry/types.ts";
import { createFontOutliner } from "../core/typography/opentypeFont.ts";

export interface FontEntry {
  id: string;
  label: string;
  url: string;
}

// Add fonts here; nothing else needs to change.
export const FONTS: FontEntry[] = [
  { id: "pacifico", label: "Pacifico", url: "/fonts/Pacifico-Regular.ttf" },
  { id: "zilla-slab-semibold", label: "Zilla Slab SemiBold", url: "/fonts/ZillaSlab-SemiBold.ttf" },
];

export const DEFAULT_NAME_FONT_ID = "pacifico";
export const DEFAULT_YEAR_FONT_ID = "zilla-slab-semibold";
export { DEFAULT_TILE_FONT_ID } from "../core/models/defaults.ts";

export function knownFontId(id: string | undefined, fallback: string): string {
  return FONTS.some((f) => f.id === id) ? (id as string) : fallback;
}

const cache = new Map<string, Promise<FontOutliner>>();

export function loadFont(id: string): Promise<FontOutliner> {
  const cached = cache.get(id);
  if (cached) return cached;
  const entry = FONTS.find((f) => f.id === id);
  if (!entry) return Promise.reject(new Error(`Unknown font "${id}".`));
  const promise = (async () => {
    const res = await fetch(entry.url);
    if (!res.ok) throw new Error(`Could not load font "${entry.label}" (HTTP ${res.status}).`);
    return createFontOutliner(id, await res.arrayBuffer());
  })();
  // Do not cache failures, so a retry can succeed.
  promise.catch(() => cache.delete(id));
  cache.set(id, promise);
  return promise;
}
