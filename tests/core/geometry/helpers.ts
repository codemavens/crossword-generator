import { readFileSync } from "node:fs";
import { createFontOutliner } from "../../../src/core/typography/opentypeFont.ts";
import { buildFrameGeometry } from "../../../src/core/geometry/frame.ts";
import { defaultFrameSettings } from "../../../src/core/models/defaults.ts";
import type { FrameSettings } from "../../../src/core/models/project.ts";
import type { FontOutliner, FrameGeometry, Point, Ring } from "../../../src/core/geometry/types.ts";

function loadFont(file: string): ArrayBuffer {
  const bytes = readFileSync(new URL(`../../../public/fonts/${file}`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export const nameFont: FontOutliner = createFontOutliner("pacifico", loadFont("Pacifico-Regular.ttf"));
export const yearFont: FontOutliner = createFontOutliner("zilla-slab-semibold", loadFont("ZillaSlab-SemiBold.ttf"));
export const pacificoBytes = (): ArrayBuffer => loadFont("Pacifico-Regular.ttf");

export function frame(familyName: string, year?: string, overrides: Partial<FrameSettings> = {}): FrameGeometry {
  const settings = { ...defaultFrameSettings(), ...overrides };
  return buildFrameGeometry({ familyName, year, settings, nameFont, yearFont });
}

// Derived lengths for the default settings.
export function defaultDims(): { R: number; rin: number; yLine: number } {
  const s = defaultFrameSettings();
  const R = s.outerDiameterMm / 2;
  const rin = R - s.ringWidthMm;
  return { R, rin, yLine: rin - s.bottomLineHeightMm };
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// True when no two non-adjacent edges cross.
export function isSimpleRing(ring: Ring): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(a, b, ring[j]!, ring[(j + 1) % n]!)) return false;
    }
  }
  return true;
}

// Area of the inner disc above the line y = yLine (y down).
export function baseOpeningArea(rin: number, yLine: number): number {
  const segmentBelow = rin * rin * Math.acos(yLine / rin) - yLine * Math.sqrt(rin * rin - yLine * yLine);
  return Math.PI * rin * rin - segmentBelow;
}
