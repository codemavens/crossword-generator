import { extendDown, offsetRound, outerRings, unionAll } from "./polygonOps.ts";
import type { Ring } from "./types.ts";

export interface NameBlobOptions {
  bufferMm: number;
  // Closing radius that bridges gaps between letters and words.
  closingMm: number;
  // Everything below the blob down to this y becomes wood.
  extendToY: number;
}

// Closing radius as a fraction of the font size, from close (0) to loose (1).
export function closingRadius(fontSizeMm: number, smoothness: number): number {
  return fontSizeMm * (0.12 + (0.9 - 0.12) * smoothness);
}

// Wood region around the name: buffered, closed, hole-free and solid all the way down.
export function buildNameBlob(glyphRings: Ring[], opts: NameBlobOptions): Ring[] {
  if (glyphRings.length === 0) return [];
  let blob = offsetRound(unionAll(glyphRings), opts.bufferMm);
  blob = offsetRound(offsetRound(blob, opts.closingMm), -opts.closingMm);
  blob = outerRings(blob);
  const top = blob.reduce((m, r) => r.reduce((mm, p) => Math.min(mm, p.y), m), Infinity);
  return outerRings(extendDown(blob, Math.max(1, opts.extendToY - top)));
}
