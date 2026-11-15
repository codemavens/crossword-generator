import type { FrameSettings } from "../models/project.ts";
import { FRAME_LIMITS } from "../models/validation.ts";
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
// Engraving points must stay this far inside the outer edge.
const EDGE_MARGIN_MM = 3;
// Smallest font size the geometry will outline.
const MIN_FONT_MM = 0.01;

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

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function fmt(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

// Clamps a setting to what the geometry can build, warning when the stored value is not what is used.
function pick(
  warnings: FrameWarning[],
  key: keyof FrameSettings,
  raw: number | undefined,
  fallback: number,
  lo: number,
  hi: number,
): number {
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
  const used = clamp(value, lo, hi);
  if (raw !== undefined && used !== raw) {
    warnings.push({ code: "setting-adjusted", message: `${key} ${String(raw)} cannot be used; using ${fmt(used)}.` });
  }
  return used;
}

// Defensive clamps; validation and the controls should already keep values inside these.
function dimensionsFrom(s: FrameSettings, warnings: FrameWarning[]): Dimensions {
  const L = FRAME_LIMITS;
  const D = pick(warnings, "outerDiameterMm", s.outerDiameterMm, 300, L.outerDiameterMm.min, L.outerDiameterMm.max);
  const R = D / 2;
  const ring = pick(warnings, "ringWidthMm", s.ringWidthMm, 12, L.ringWidthMm.min, R - 0.5);
  const rin = R - ring;
  const yLine = rin - pick(warnings, "bottomLineHeightMm", s.bottomLineHeightMm, 40, 0, rin);
  const rcMax = Math.min(maxCornerRadius(rin, yLine), L.bottomCornerRadiusMm.max);
  const rc = pick(warnings, "bottomCornerRadiusMm", s.bottomCornerRadiusMm, 0, 0, rcMax);
  const drop = pick(warnings, "nameDropMm", s.nameDropMm, 0, 0, Math.min(R - yLine, L.nameDropMm.max));
  const sizeMax = L.familyNameFontSizeMm.max;
  const nameSize = pick(warnings, "familyNameFontSizeMm", s.familyNameFontSizeMm, 30, MIN_FONT_MM, sizeMax);
  return {
    R,
    rin,
    yLine,
    nameBaselineY: yLine + drop,
    rc,
    nameSize,
    yearSize: pick(warnings, "yearFontSizeMm", s.yearFontSizeMm, 0.6 * nameSize, MIN_FONT_MM, sizeMax),
    buffer: pick(warnings, "nameBufferMm", s.nameBufferMm, 3, 0, L.nameBufferMm.max),
    smoothness: pick(warnings, "contourSmoothness", s.contourSmoothness, 0.2, 0, 1),
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
  const warnings: FrameWarning[] = [];
  const d = dimensionsFrom(input.settings, warnings);
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
    if (nearEdge(nameRings, d)) {
      warnings.push({ code: "name-outside-frame", message: "The family name reaches the outer edge of the frame." });
    }
    const blob = translateRings(nameBlobAtBaseline(input.nameFont, name, placedName!.place(0), d), 0, d.nameBaselineY);
    const piece = largestPiece(subtract([baseOpening], blob));
    if (!piece) warnings.push({ code: "no-opening", message: "The name and its buffer leave no opening in the frame." });
    innerCut = piece ?? [];
  }

  const yearRings = buildYear(input, d, nameRings, warnings);
  const hasOpening = innerCut.length > 0;
  return {
    outer,
    innerCut,
    engraving: { name: nameRings, year: yearRings },
    backer: { ...outer },
    usableOpening: {
      polygon: innerCut,
      centroid: hasOpening ? areaCentroid(innerCut) : { x: 0, y: 0 },
      areaMm2: hasOpening ? ringArea(innerCut) : 0,
    },
    warnings,
  };
}

// Below-baseline depth of the blob's solid extension; past the largest frame's outer edge.
const BLOB_DEPTH_MM = FRAME_LIMITS.outerDiameterMm.max + 10;
const BLOB_CACHE_SIZE = 8;
const blobCache = new WeakMap<FontOutliner, Map<string, Ring[]>>();

// The name blob is the slow step and does not depend on the diameter, so it is built at baseline 0 and reused.
function nameBlobAtBaseline(font: FontOutliner, name: string, rings: Ring[], d: Dimensions): Ring[] {
  const closingMm = closingRadius(d.nameSize, d.smoothness);
  const key = JSON.stringify([name, d.nameSize, d.buffer, closingMm]);
  let byFont = blobCache.get(font);
  if (!byFont) {
    byFont = new Map();
    blobCache.set(font, byFont);
  }
  const hit = byFont.get(key);
  if (hit) return hit;
  const blob = buildNameBlob(rings, { bufferMm: d.buffer, closingMm, extendToY: BLOB_DEPTH_MM });
  if (byFont.size >= BLOB_CACHE_SIZE) byFont.delete(byFont.keys().next().value as string);
  byFont.set(key, blob);
  return blob;
}

function nearEdge(rings: Ring[], d: Dimensions): boolean {
  const limit = d.R - EDGE_MARGIN_MM;
  return rings.some((r) => r.some((p) => Math.hypot(p.x, p.y) > limit));
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
  if (nearEdge(rings, d)) {
    warnings.push({ code: "year-does-not-fit", message: "The year does not fit in the solid area below the line." });
  }
  return rings;
}
