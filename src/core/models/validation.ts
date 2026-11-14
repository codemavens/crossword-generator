import type { NameArtProject } from "./project.ts";

export const MIN_NAME_LENGTH = 2;
export const MAX_NAMES = 50;
export const MAX_TEXT_LENGTH = 200;
export const MAX_TILE_SIZE_MM = 200;

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

export function validateNameText(text: string): string | null {
  const trimmed = text.trim();
  if (characterCount(trimmed) < MIN_NAME_LENGTH) {
    return `Names must have at least ${MIN_NAME_LENGTH} characters.`;
  }
  if (trimmed.length > MAX_TEXT_LENGTH) return "Name is too long.";
  return null;
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
}

interface NumberRule {
  key: string;
  min: number;
  max: number;
  minExclusive?: boolean;
}

const FRAME_RULES: NumberRule[] = [
  { key: "outerDiameterMm", min: 20, max: 2000 },
  { key: "familyNameFontSizeMm", min: 0, max: 300, minExclusive: true },
  { key: "yearFontSizeMm", min: 0, max: 300, minExclusive: true },
  { key: "nameBufferMm", min: 0, max: 50 },
  { key: "contourSmoothness", min: 0, max: 1 },
  { key: "bottomLineHeightMm", min: 0, max: Infinity },
  { key: "bottomCornerRadiusMm", min: 0, max: Infinity },
  { key: "crosswordClearanceMm", min: 0, max: 100 },
];

// Fields missing from older saved projects are skipped.
function checkFrame(issues: ValidationIssue[], frame: Record<string, unknown>): void {
  const bad = (key: string, message: string) =>
    issues.push({ field: `settings.frame.${key}`, message });
  for (const rule of FRAME_RULES) {
    const value = frame[rule.key];
    if (value === undefined) continue;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (rule.minExclusive ? value <= rule.min : value < rule.min) ||
      value > rule.max
    ) {
      bad(rule.key, "Must be a number within the allowed range.");
    }
  }
  const ring = frame.ringWidthMm;
  if (ring !== undefined) {
    const d = frame.outerDiameterMm;
    const limit = typeof d === "number" && Number.isFinite(d) ? d / 2 : Infinity;
    if (typeof ring !== "number" || !Number.isFinite(ring) || ring <= 0 || ring >= limit) {
      bad("ringWidthMm", "Must be above 0 and below half the outer diameter.");
    }
  }
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
  if (!Array.isArray(input.artwork)) issues.push({ field: "artwork", message: "Must be a list." });

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
