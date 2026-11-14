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
