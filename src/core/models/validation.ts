import type { NameArtProject } from "./project.ts";
import { MAX_CUSTOM_ARTWORK, isBuiltinArtworkId } from "../artwork/constants.ts";
import { artworkAssetProblem } from "../artwork/validateAsset.ts";

export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 30;
export const MAX_NAMES = 20;
export const MAX_TEXT_LENGTH = 200;
export const MAX_TILE_SIZE_MM = 200;
// Bounds for a saved layout; generous, they only stop absurd documents.
export const MAX_GRID_COORDINATE = 10000;
// One tile per name end (CHG-0006).
export const MAX_TILES_PER_NAME = 2;
export const MAX_DECORATIVE_TILES = MAX_NAMES * MAX_TILES_PER_NAME;
export const MAX_OFFSET_MM = 10000;
// Letter cap height as a fraction of the tile size.
export const LETTER_HEIGHT_RATIO_LIMITS = { min: 0.3, max: 0.8 } as const;

export interface ValidationIssue {
  // Dotted path to the offending field, e.g. "names.2.text".
  field: string;
  message: string;
}

// Counts user-perceived characters, not UTF-16 code units (SPEC §15.2).
export function characterCount(text: string): number {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let count = 0;
  for (const _ of segmenter.segment(text)) count++;
  return count;
}

export type NameTextProblem = "spaces" | "unsupported" | "too-short" | "too-long";
export type NameTextResult = { ok: true; chars: string[] } | { ok: false; problem: NameTextProblem; message: string };

const APOSTROPHES = new Set(["'", "\u2018", "\u2019", "\u02BC", "\uFF07"]);
const HYPHENS = new Set(["-", "\u2010", "\u2011", "\u2012", "\u2013", "\u2212", "\uFE63", "\uFF0D"]);

// A–Z, or a letter from the Latin-1, Latin Extended-A/B or Latin Extended Additional blocks.
function isSupportedLetter(ch: string): boolean {
  if (/^[A-Z]$/.test(ch)) return true;
  const cp = ch.codePointAt(0)!;
  const latin = (cp >= 0xc0 && cp <= 0x24f) || (cp >= 0x1e00 && cp <= 0x1eff);
  return latin && /^\p{L}$/u.test(ch);
}

// SPEC §5.3 / §7.2 step 1: one entry in `chars` per tile, in canonical comparison form.
export function normalizeNameText(text: string): NameTextResult {
  const nfc = text.trim().normalize("NFC");
  if (/\s/u.test(nfc)) {
    return { ok: false, problem: "spaces", message: "Names cannot contain spaces. Use the joined or hyphenated form, e.g. MARYANN or MARY-ANN." };
  }
  const chars: string[] = [];
  for (const raw of nfc) {
    if (APOSTROPHES.has(raw)) {
      chars.push("'");
      continue;
    }
    if (HYPHENS.has(raw)) {
      chars.push("-");
      continue;
    }
    const upper = raw.toUpperCase().normalize("NFC");
    if (Array.from(upper).length !== 1) {
      return { ok: false, problem: "unsupported", message: `"${raw}" has no single-letter capital form; spell it out (e.g. SS for ß).` };
    }
    if (!isSupportedLetter(upper)) {
      const shown = /^\p{M}$/u.test(raw) ? "an accent mark that cannot be combined with its letter" : `"${raw}"`;
      return { ok: false, problem: "unsupported", message: `Names cannot contain ${shown}. Use letters, apostrophes and hyphens.` };
    }
    chars.push(upper);
  }
  if (chars.length < MIN_NAME_LENGTH) return { ok: false, problem: "too-short", message: `Names must have at least ${MIN_NAME_LENGTH} characters.` };
  if (chars.length > MAX_NAME_LENGTH) return { ok: false, problem: "too-long", message: `Names can have at most ${MAX_NAME_LENGTH} characters.` };
  return { ok: true, chars };
}

export function validateNameText(text: string): string | null {
  if (text.length > MAX_TEXT_LENGTH) return "Name is too long.";
  const result = normalizeNameText(text);
  return result.ok ? null : result.message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkText(
  issues: ValidationIssue[],
  field: string,
  value: unknown,
  required: boolean,
): void {
  if (value === undefined || value === null) {
    if (required) issues.push({ field, message: "Required." });
    return;
  }
  if (typeof value !== "string") {
    issues.push({ field, message: "Must be text." });
    return;
  }
  if (required && value.trim() === "") issues.push({ field, message: "Required." });
  if (value.length > MAX_TEXT_LENGTH) issues.push({ field, message: "Too long." });
}

function checkSettings(issues: ValidationIssue[], settings: unknown): void {
  if (!isRecord(settings)) {
    issues.push({ field: "settings", message: "Required." });
    return;
  }
  const tile = settings.tileSizeMm;
  if (typeof tile !== "number" || !Number.isFinite(tile) || tile <= 0 || tile > MAX_TILE_SIZE_MM) {
    issues.push({
      field: "settings.tileSizeMm",
      message: `Must be a number above 0 and at most ${MAX_TILE_SIZE_MM}.`,
    });
  }
  for (const key of ["frame", "lettering", "solver"]) {
    if (!isRecord(settings[key])) issues.push({ field: `settings.${key}`, message: "Required." });
  }
  if (isRecord(settings.frame)) checkFrame(issues, settings.frame);
  if (isRecord(settings.lettering)) checkLettering(issues, settings.lettering);
  // Optional so projects saved before export colours existed still validate.
  if (settings.export !== undefined) checkExport(issues, settings.export);
}

export const EXPORT_COLOUR_KEYS = ["cutColour", "scoreColour", "engraveColour"] as const;
const HEX_COLOUR = /^#[0-9A-Fa-f]{6}$/;

export function isHexColour(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOUR.test(value);
}

function checkExport(issues: ValidationIssue[], value: unknown): void {
  if (!isRecord(value)) {
    issues.push({ field: "settings.export", message: "Must be an object." });
    return;
  }
  for (const key of EXPORT_COLOUR_KEYS) {
    if (!isHexColour(value[key])) issues.push({ field: `settings.export.${key}`, message: "Must be a colour like #FF0000." });
  }
}

export function letterHeightRatioOk(value: unknown): value is number {
  const { min, max } = LETTER_HEIGHT_RATIO_LIMITS;
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

// Fields missing from older saved projects are skipped.
function checkLettering(issues: ValidationIssue[], lettering: Record<string, unknown>): void {
  const ratio = lettering.letterHeightRatio;
  if (ratio !== undefined && !letterHeightRatioOk(ratio)) {
    const { min, max } = LETTER_HEIGHT_RATIO_LIMITS;
    issues.push({ field: "settings.lettering.letterHeightRatio", message: `Must be between ${min} and ${max}.` });
  }
  if (lettering.showScores !== undefined && typeof lettering.showScores !== "boolean") {
    issues.push({ field: "settings.lettering.showScores", message: "Must be true or false." });
  }
}

export interface NumberLimit {
  min: number;
  max: number;
  minExclusive?: boolean;
}

export type FrameNumericKey =
  | "outerDiameterMm"
  | "ringWidthMm"
  | "familyNameFontSizeMm"
  | "yearFontSizeMm"
  | "nameBufferMm"
  | "contourSmoothness"
  | "bottomLineHeightMm"
  | "nameDropMm"
  | "bottomCornerRadiusMm"
  | "crosswordClearanceMm";

// Single source of the frame's numeric limits, shared by validation, the controls and the geometry.
export const FRAME_LIMITS: Record<FrameNumericKey, NumberLimit> = {
  outerDiameterMm: { min: 20, max: 2000 },
  ringWidthMm: { min: 0.5, max: 1000 },
  familyNameFontSizeMm: { min: 0, max: 300, minExclusive: true },
  yearFontSizeMm: { min: 0, max: 300, minExclusive: true },
  nameBufferMm: { min: 0, max: 50 },
  contourSmoothness: { min: 0, max: 1 },
  bottomLineHeightMm: { min: 0, max: 1000 },
  nameDropMm: { min: 0, max: 200 },
  bottomCornerRadiusMm: { min: 0, max: 1000 },
  crosswordClearanceMm: { min: 0, max: 100 },
};

export function inLimit(key: FrameNumericKey, value: unknown): value is number {
  const rule = FRAME_LIMITS[key];
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (rule.minExclusive ? value > rule.min : value >= rule.min) &&
    value <= rule.max
  );
}

export function limitMessage(key: FrameNumericKey): string {
  const rule = FRAME_LIMITS[key];
  return `Must be ${rule.minExclusive ? "above" : "at least"} ${rule.min} and at most ${rule.max}.`;
}

export interface FrameFieldProblem {
  key: FrameNumericKey;
  message: string;
}

// Rules between fields; each applies only when the fields it needs are present and individually valid.
export function frameCrossFieldProblems(frame: Record<string, unknown>): FrameFieldProblem[] {
  const problems: FrameFieldProblem[] = [];
  const d = frame.outerDiameterMm;
  const ring = frame.ringWidthMm;
  const line = frame.bottomLineHeightMm;
  const drop = frame.nameDropMm;
  const ringOk = inLimit("ringWidthMm", ring);
  const diameterOk = inLimit("outerDiameterMm", d);
  const ringFits = ringOk && !(diameterOk && ring >= d / 2);
  if (ringOk && !ringFits && diameterOk) {
    problems.push({ key: "ringWidthMm", message: `Must be below half the outer diameter (${d / 2} mm).` });
  }
  if (diameterOk && ringOk && ringFits && inLimit("bottomLineHeightMm", line) && line > d / 2 - ring) {
    problems.push({ key: "bottomLineHeightMm", message: `Must be at most the inner radius (${d / 2 - ring} mm).` });
  }
  if (ringOk && inLimit("bottomLineHeightMm", line) && inLimit("nameDropMm", drop) && drop > ring + line) {
    problems.push({
      key: "nameDropMm",
      message: `Must be at most ring width plus line height (${ring + line} mm) so the baseline stays inside the frame.`,
    });
  }
  return problems;
}

// Fields missing from older saved projects are skipped.
function checkFrame(issues: ValidationIssue[], frame: Record<string, unknown>): void {
  for (const key of Object.keys(FRAME_LIMITS) as FrameNumericKey[]) {
    const value = frame[key];
    if (value === undefined) continue;
    if (!inLimit(key, value)) issues.push({ field: `settings.frame.${key}`, message: limitMessage(key) });
  }
  for (const p of frameCrossFieldProblems(frame)) {
    issues.push({ field: `settings.frame.${p.key}`, message: p.message });
  }
}

function isGridInt(value: unknown): boolean {
  return Number.isInteger(value) && Math.abs(value as number) <= MAX_GRID_COORDINATE;
}

function isGridPosition(value: unknown): boolean {
  return isRecord(value) && isGridInt(value.x) && isGridInt(value.y);
}

function isShortText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_TEXT_LENGTH;
}

// Shape and bounds only; the crossword rules are checked by the solver's validateLayout.
function checkLayout(issues: ValidationIssue[], layout: unknown, artworkIds: ReadonlySet<string>): void {
  const field = "selectedLayout";
  if (!isRecord(layout)) {
    issues.push({ field, message: "Must be an object." });
    return;
  }
  if (!isShortText(layout.id)) issues.push({ field: `${field}.id`, message: "Must be text." });
  if (typeof layout.seed !== "number" || !Number.isFinite(layout.seed)) {
    issues.push({ field: `${field}.seed`, message: "Must be a number." });
  }
  const offset = layout.offset;
  const offsetOk =
    isRecord(offset) &&
    [offset.xMm, offset.yMm].every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_OFFSET_MM);
  if (!offsetOk) issues.push({ field: `${field}.offset`, message: `Must have xMm and yMm within ±${MAX_OFFSET_MM}.` });

  if (!Array.isArray(layout.placements) || layout.placements.length > MAX_NAMES) {
    issues.push({ field: `${field}.placements`, message: `Must be a list of at most ${MAX_NAMES} placements.` });
  } else {
    layout.placements.forEach((p: unknown, i: number) => {
      const ok =
        isRecord(p) &&
        isShortText(p.nameId) &&
        isGridPosition(p.start) &&
        (p.direction === "horizontal" || p.direction === "vertical");
      if (!ok) issues.push({ field: `${field}.placements.${i}`, message: "Invalid placement." });
    });
  }

  if (!Array.isArray(layout.decorativeTiles) || layout.decorativeTiles.length > MAX_DECORATIVE_TILES) {
    issues.push({ field: `${field}.decorativeTiles`, message: `Must be a list of at most ${MAX_DECORATIVE_TILES} tiles.` });
  } else {
    const perName = new Map<string, number>();
    layout.decorativeTiles.forEach((t: unknown, i: number) => {
      const anchor = isRecord(t) ? t.anchor : undefined;
      const ok =
        isRecord(t) &&
        isShortText(t.id) &&
        isGridPosition(t.position) &&
        (t.artworkId === null || isBuiltinArtworkId(t.artworkId) || (typeof t.artworkId === "string" && artworkIds.has(t.artworkId))) &&
        (t.source === "automatic" || t.source === "manual") &&
        (t.purpose === "connector" || t.purpose === "decoration") &&
        isRecord(anchor) &&
        isShortText(anchor.nameId) &&
        (anchor.end === "start" || anchor.end === "end") &&
        // A connector names the one other name it joins; a decoration joins nothing.
        (t.purpose === "connector" ? isShortText(t.joinsNameId) && t.joinsNameId !== anchor.nameId : t.joinsNameId === undefined);
      if (!ok) {
        issues.push({ field: `${field}.decorativeTiles.${i}`, message: "Invalid decorative tile." });
        return;
      }
      const name = (anchor as { nameId: string }).nameId;
      const count = (perName.get(name) ?? 0) + 1;
      perName.set(name, count);
      if (count === MAX_TILES_PER_NAME + 1) {
        issues.push({ field: `${field}.decorativeTiles`, message: `At most ${MAX_TILES_PER_NAME} decorative tiles per name.` });
      }
    });
  }
}

// Uploaded pictures must be in the stored shape form (CHG-0007 AC13). Returns the ids tiles may refer to.
function checkArtwork(issues: ValidationIssue[], artwork: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(artwork) || artwork.length > MAX_CUSTOM_ARTWORK) {
    issues.push({ field: "artwork", message: `Must be a list of at most ${MAX_CUSTOM_ARTWORK} uploaded pictures.` });
    return ids;
  }
  artwork.forEach((a: unknown, i: number) => {
    const problem = artworkAssetProblem(a);
    if (problem) {
      issues.push({ field: `artwork.${i}`, message: problem });
      return;
    }
    const id = (a as { id: string }).id;
    if (ids.has(id)) issues.push({ field: `artwork.${i}.id`, message: "Picture ids must be unique." });
    ids.add(id);
  });
  return ids;
}

// Validates an untrusted project document. Empty result means it is safe to store.
export function validateProject(input: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) return [{ field: "", message: "Project must be an object." }];

  checkText(issues, "projectName", input.projectName, true);
  checkText(issues, "customerName", input.customerName, false);
  checkText(issues, "familyName", input.familyName, false);
  checkText(issues, "year", input.year, false);

  if (!Number.isInteger(input.schemaVersion)) {
    issues.push({ field: "schemaVersion", message: "Must be an integer." });
  }
  checkSettings(issues, input.settings);
  const artworkIds = checkArtwork(issues, input.artwork);
  if (input.selectedLayout !== undefined) checkLayout(issues, input.selectedLayout, artworkIds);

  if (!Array.isArray(input.names)) {
    issues.push({ field: "names", message: "Must be a list." });
    return issues;
  }
  if (input.names.length > MAX_NAMES) {
    issues.push({ field: "names", message: `At most ${MAX_NAMES} names.` });
  }
  const seen = new Set<string>();
  input.names.forEach((entry: unknown, index: number) => {
    const field = `names.${index}`;
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.text !== "string") {
      issues.push({ field, message: "Must have an id and text." });
      return;
    }
    if (entry.id === "" || seen.has(entry.id)) {
      issues.push({ field: `${field}.id`, message: "Name ids must be unique." });
    }
    seen.add(entry.id);
    const problem = validateNameText(entry.text);
    if (problem) issues.push({ field: `${field}.text`, message: problem });
  });
  return issues;
}

export function isValidProject(input: unknown): input is NameArtProject {
  return validateProject(input).length === 0;
}
