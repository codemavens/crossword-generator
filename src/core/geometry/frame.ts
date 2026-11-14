import type { FrameSettings } from "../models/project.ts";
import { buildBaseOpening, maxCornerRadius } from "./baseOpening.ts";
import { buildNameBlob, closingRadius } from "./nameBlob.ts";
import { outerRings, ringArea, simplifyRing, subtract } from "./polygonOps.ts";
import { areaCentroid, ringsBounds, translateRings } from "./ringMath.ts";
import type { FontOutliner, FrameGeometry, FrameWarning, Ring } from "./types.ts";

export interface FrameInput {
  familyName: string;
  year?: string;
  settings: FrameSettings;
  nameFont: FontOutliner;
  yearFont: FontOutliner;
}

// Light clean-up of the final cut; well below the arc tessellation tolerance.
const SIMPLIFY_EPSILON_MM = 0.005;
// Year points must stay this far inside the outer edge.
const YEAR_EDGE_MARGIN_MM = 3;

interface Dimensions {
  R: number;
  rin: number;
  yLine: number;
  nameBaselineY: number;
  rc: number;
  nameSize: number;
  yearSize: number;
  buffer: number;
  smoothness: number;
}

function num(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// Clamps nonsensical settings to something buildable instead of throwing.
function dimensionsFrom(s: FrameSettings): Dimensions {
  const R = Math.max(10, num(s.outerDiameterMm, 300) / 2);
  const ring = clamp(num(s.ringWidthMm, 12), 0.5, R * 0.9);
  const rin = R - ring;
  const yLine = rin - clamp(num(s.bottomLineHeightMm, 40), 1, rin);
  const rc = clamp(num(s.bottomCornerRadiusMm, 0), 0, maxCornerRadius(rin, yLine));
  const nameSize = Math.max(0.5, num(s.familyNameFontSizeMm, 30));
  return {
    R,
    rin,
    yLine,
    nameBaselineY: yLine + clamp(num(s.nameDropMm, 0), 0, R - yLine),
    rc,
    nameSize,
    yearSize: Math.max(0.5, num(s.yearFontSizeMm, 0.6 * nameSize)),
    buffer: Math.max(0, num(s.nameBufferMm, 3)),
    smoothness: clamp(num(s.contourSmoothness, 0.2), 0, 1),
  };
}

// Outlines text centred on x = 0 with its baseline at baselineY, or reports a missing glyph.
function placeText(
  font: FontOutliner,
  text: string,
  size: number,
  label: string,
  warnings: FrameWarning[],
): { rings: Ring[]; top: number; bottom: number; place: (baselineY: number) => Ring[] } | null {
  if (!font.hasGlyphs(text)) {
    warnings.push({ code: "missing-glyph", message: `The ${label} font has no glyph for a character in "${text}".` });
    return null;
  }
  const outline = font.outline(text, size);
  const b = outline.bounds;
  const dx = -(b.minX + b.maxX) / 2;
  return {
    rings: outline.rings,
    top: b.minY,
    bottom: b.maxY,
    place: (baselineY) => translateRings(outline.rings, dx, baselineY),
  };
}

export function buildFrameGeometry(input: FrameInput): FrameGeometry {
  const d = dimensionsFrom(input.settings);
  const warnings: FrameWarning[] = [];
  const outer = { cx: 0, cy: 0, r: d.R };
  const baseOpening = buildBaseOpening(d.rin, d.yLine, d.rc);

  const name = input.familyName.normalize("NFC").trim();
  const placedName = name ? placeText(input.nameFont, name, d.nameSize, "family name", warnings) : null;
  const nameRings = placedName ? placedName.place(d.nameBaselineY) : [];

  let innerCut = baseOpening;
  if (nameRings.length > 0) {
    if (nameTooWide(nameRings, d)) {
      warnings.push({ code: "name-too-wide", message: "The family name is wider than the opening at the bottom line." });
    }
    const blob = buildNameBlob(nameRings, {
      bufferMm: d.buffer,
      closingMm: closingRadius(d.nameSize, d.smoothness),
      extendToY: d.R + 10,
    });
    innerCut = largestPiece(subtract([baseOpening], blob)) ?? baseOpening;
  }

  const yearRings = buildYear(input, d, nameRings, warnings);
  const area = ringArea(innerCut);
  return {
    outer,
    innerCut,
    engraving: { name: nameRings, year: yearRings },
    backer: { ...outer },
    usableOpening: { polygon: innerCut, centroid: areaCentroid(innerCut), areaMm2: area },
    warnings,
  };
}

// The buffered name must fit inside the inner circle's chord at the bottom line.
function nameTooWide(nameRings: Ring[], d: Dimensions): boolean {
  const b = ringsBounds(nameRings);
  const halfWidth = Math.max(Math.abs(b.minX), Math.abs(b.maxX)) + d.buffer;
  return halfWidth > Math.sqrt(d.rin * d.rin - d.yLine * d.yLine);
}

// Keeps the biggest opening piece's outer ring; other pieces and holes become wood.
function largestPiece(rings: Ring[]): Ring | null {
  let best: Ring | null = null;
  let bestArea = 0;
  for (const ring of outerRings(rings)) {
    const a = ringArea(ring);
    if (a > bestArea) {
      best = ring;
      bestArea = a;
    }
  }
  return best ? simplifyRing(best, SIMPLIFY_EPSILON_MM) : null;
}

function buildYear(input: FrameInput, d: Dimensions, nameRings: Ring[], warnings: FrameWarning[]): Ring[] {
  const year = (input.year ?? "").normalize("NFC").trim();
  if (!year) return [];
  const placed = placeText(input.yearFont, year, d.yearSize, "year", warnings);
  if (!placed || placed.rings.length === 0) return [];
  const nameBottom = nameRings.length > 0 ? ringsBounds(nameRings).maxY : -Infinity;
  // The gap is at least the buffer so the year keeps the same clearance from the cut as the name.
  const gap = Math.max(2, 0.15 * d.yearSize, d.buffer);
  const rings = placed.place(Math.max(d.yLine, nameBottom) + gap - placed.top);
  const limit = d.R - YEAR_EDGE_MARGIN_MM;
  if (rings.some((r) => r.some((p) => Math.hypot(p.x, p.y) > limit))) {
    warnings.push({ code: "year-does-not-fit", message: "The year does not fit in the solid area below the line." });
  }
  return rings;
}
