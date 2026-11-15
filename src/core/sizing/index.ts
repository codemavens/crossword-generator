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

// Fit is not monotonic in size (a crossword can wrap around the family-name contour), so both searches scan.
const MAX_COARSE_PROBES = 300;

// Largest tile size (a multiple of stepMm, default 0.1 mm) at which the crossword fits at its current offset.
// Coarse scan (about 1 mm) from the top down, then every step in the gap above the highest coarse fit.
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
  const kMin = Math.max(1, Math.ceil(round6(q.min / step)));
  const kMax = Math.floor(round6(Math.min(q.max, bound) / step));
  if (kMax < kMin) return null;
  const coarse = Math.max(1, Math.round(1 / step), Math.ceil((kMax - kMin) / MAX_COARSE_PROBES));
  // Coarse probes: kMax, kMax - coarse, ..., always ending on kMin.
  let above = -1;
  let found = -1;
  for (let k = kMax; ; k = Math.max(kMin, k - coarse)) {
    if (fits(k)) {
      found = k;
      break;
    }
    above = k;
    if (k === kMin) return null;
  }
  // Refine: the highest fitting step strictly between the coarse fit and the coarse probe above it.
  if (above !== -1) {
    for (let k = above - 1; k > found; k--) {
      if (fits(k)) return round6(k * step);
    }
  }
  return round6(found * step);
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
// Coarse scan upward from the lowest possible diameter, then every whole mm in the gap below the first coarse fit.
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
  const coarse = Math.max(1, Math.ceil((dMax - dMin) / MAX_COARSE_PROBES));
  // Coarse probes upward from dMin, always ending on dMax; stops at the first fit.
  let below = dMin - 1;
  let found = -1;
  for (let d = dMin; ; d = Math.min(dMax, d + coarse)) {
    if (fits(d)) {
      found = d;
      break;
    }
    if (d === dMax) return null;
    below = d;
  }
  // Refine: the smallest fitting diameter strictly between the coarse probe below and the coarse fit.
  for (let d = below + 1; d < found; d++) {
    if (fits(d)) return d;
  }
  return found;
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
