// Size suggestions for the "Largest that fits" / "Smallest that fits" buttons. Pure: they only report a value.
import { buildFrameGeometry } from "../geometry/frame.ts";
import type { FontOutliner, Point, Ring } from "../geometry/types.ts";
import type { CrosswordLayout, FrameSettings, NameEntry } from "../models/project.ts";
import { FRAME_LIMITS, MAX_OFFSET_MM, frameCrossFieldProblems, inLimit } from "../models/validation.ts";
import { checkFit, openingForSolver } from "../solver/fit.ts";
import { cellsBounds, occupiedCells } from "../solver/grid.ts";
import { normalizeNames } from "../solver/normalize.ts";

export interface TileSizeQuery {
  names: NameEntry[];
  layout: CrosswordLayout;
  // The frame's usable opening in mm.
  opening: { polygon: Ring; centroid: Point };
  clearanceMm: number;
  min: number;
  max: number;
  stepMm?: number;
}

export interface DiameterQuery {
  familyName: string;
  year?: string;
  frame: FrameSettings;
  nameFont: FontOutliner;
  yearFont: FontOutliner;
  names: NameEntry[];
  layout: CrosswordLayout;
  tileSizeMm: number;
  min: number;
  max: number;
}

// Crossword extent in whole tiles; null when it has no tiles.
function tileExtent(names: NameEntry[], layout: CrosswordLayout): { width: number; height: number } | null {
  const b = cellsBounds(occupiedCells(normalizeNames(names).names, layout));
  return b.width > 0 && b.height > 0 ? { width: b.width, height: b.height } : null;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

// Largest tile size (a multiple of stepMm, default 0.1 mm) at which the crossword fits at its current offset.
// Search invariant: lo fits, hi does not, so the answer always fits and one step larger does not.
export function largestTileSizeThatFits(q: TileSizeQuery): number | null {
  const step = q.stepMm !== undefined && q.stepMm > 0 ? q.stepMm : 0.1;
  const extent = tileExtent(q.names, q.layout);
  if (!extent || q.opening.polygon.length < 3) return null;
  const clearance = Math.max(0, q.clearanceMm);
  const fits = (k: number): boolean => {
    const size = round6(k * step);
    return checkFit(q.layout, q.names, openingForSolver(q.opening, size, clearance)).fits;
  };
  // No tile can be larger than the opening's width or height (less the clearance) allows.
  const xs = q.opening.polygon.map((p) => p.x);
  const ys = q.opening.polygon.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs) - 2 * clearance;
  const h = Math.max(...ys) - Math.min(...ys) - 2 * clearance;
  const bound = Math.min(w / extent.width, h / extent.height);
  const kMin = Math.ceil(round6(q.min / step));
  const kMax = Math.floor(round6(Math.min(q.max, bound) / step));
  if (kMax < kMin || kMin <= 0) return null;
  if (!fits(kMin)) return null;
  if (fits(kMax)) return round6(kMax * step);
  let lo = kMin;
  let hi = kMax;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return round6(lo * step);
}

// Diameters below this break the frame's own rules (ring under half the diameter, line within the inner radius).
export function minimumValidDiameter(frame: FrameSettings): number {
  const ok = (d: number): boolean =>
    inLimit("outerDiameterMm", d) &&
    !frameCrossFieldProblems({ ...frame, outerDiameterMm: d }).some(
      (p) => p.key === "ringWidthMm" || p.key === "bottomLineHeightMm",
    );
  const ring = Number.isFinite(frame.ringWidthMm) ? frame.ringWidthMm : 0;
  const line = Number.isFinite(frame.bottomLineHeightMm) ? frame.bottomLineHeightMm : 0;
  let d = Math.max(Math.ceil(FRAME_LIMITS.outerDiameterMm.min), Math.ceil(2 * (ring + line)), Math.floor(2 * ring) + 1);
  while (d <= FRAME_LIMITS.outerDiameterMm.max && !ok(d)) d++;
  return d;
}

// Smallest whole-mm outer diameter at which the crossword fits; the frame is rebuilt for each probe.
export function smallestDiameterThatFits(q: DiameterQuery): number | null {
  const extent = tileExtent(q.names, q.layout);
  if (!extent || !(q.tileSizeMm > 0)) return null;
  const clearance = Math.max(0, q.frame.crosswordClearanceMm);
  const fits = (d: number): boolean => {
    try {
      const g = buildFrameGeometry({
        familyName: q.familyName,
        year: q.year,
        settings: { ...q.frame, outerDiameterMm: d },
        nameFont: q.nameFont,
        yearFont: q.yearFont,
      });
      return checkFit(q.layout, q.names, openingForSolver(g.usableOpening, q.tileSizeMm, clearance)).fits;
    } catch {
      return false;
    }
  };
  // Every tile must lie inside the inner disc shrunk by the clearance, so smaller diameters cannot fit.
  const span = Math.max(extent.width, extent.height) * q.tileSizeMm;
  const lowerBound = Math.ceil(round6(span + 2 * clearance + 2 * Math.max(0, q.frame.ringWidthMm)));
  const dMin = Math.max(Math.ceil(q.min), minimumValidDiameter(q.frame), lowerBound);
  const dMax = Math.floor(q.max);
  if (dMax < dMin) return null;
  // Known not to fit (or not allowed) just below dMin; grow geometrically to find a fitting bracket.
  let lo = dMin - 1;
  let d = dMin;
  while (!fits(d)) {
    if (d >= dMax) return null;
    lo = d;
    d = Math.min(dMax, Math.max(d + 1, Math.ceil(d * 1.25)));
  }
  let hi = d;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

// Moves the crossword by a delta in mm, rounded to 0.1 mm and kept within the saved-offset limit.
export function movedLayout(layout: CrosswordLayout, dxMm: number, dyMm: number): CrosswordLayout {
  const clamp = (v: number): number => Math.max(-MAX_OFFSET_MM, Math.min(MAX_OFFSET_MM, Math.round(v * 10) / 10)) || 0;
  const xMm = clamp(layout.offset.xMm + (Number.isFinite(dxMm) ? dxMm : 0));
  const yMm = clamp(layout.offset.yMm + (Number.isFinite(dyMm) ? dyMm : 0));
  if (xMm === layout.offset.xMm && yMm === layout.offset.yMm) return layout;
  return { ...layout, offset: { xMm, yMm } };
}

export function centredLayout(layout: CrosswordLayout): CrosswordLayout {
  return layout.offset.xMm === 0 && layout.offset.yMm === 0 ? layout : { ...layout, offset: { xMm: 0, yMm: 0 } };
}
