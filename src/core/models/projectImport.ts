import type { NameArtProject } from "./project.ts";
import { withCurrentDefaults } from "./defaults.ts";
import { validateProject } from "./validation.ts";

export const PROJECT_FILE_FORMAT = "sloth-llama-name-art";
export const PROJECT_FILE_VERSION = 1;
const MAX_MESSAGES = 5;

export interface ProjectFile {
  format: typeof PROJECT_FILE_FORMAT;
  formatVersion: typeof PROJECT_FILE_VERSION;
  exportedAt: string;
  project: NameArtProject;
}

export function makeProjectFile(project: NameArtProject, now: Date = new Date()): ProjectFile {
  return { format: PROJECT_FILE_FORMAT, formatVersion: PROJECT_FILE_VERSION, exportedAt: now.toISOString(), project };
}

export type ProjectImportResult = { ok: true; project: NameArtProject } | { ok: false; messages: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// Keys that could reach an object's prototype are dropped while parsing.
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const reviver = (key: string, value: unknown): unknown => (UNSAFE_KEYS.has(key) ? undefined : value);

// Only these top-level fields are kept; anything else in the file is ignored.
const KNOWN_FIELDS = [
  "schemaVersion",
  "projectName",
  "customerName",
  "familyName",
  "year",
  "names",
  "artwork",
  "settings",
  "selectedLayout",
] as const;

const fail = (...messages: string[]): ProjectImportResult => ({ ok: false, messages });

// Untrusted text in, a project that passes the same checks as a save out (always with a blank id: it is imported as new).
export function parseProjectImport(text: string): ProjectImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text, reviver);
  } catch {
    return fail("The file is not valid JSON.");
  }
  if (!isRecord(data)) return fail("The file does not contain a project.");

  let raw: unknown = data;
  if ("format" in data || "formatVersion" in data || "project" in data) {
    if (data.format !== PROJECT_FILE_FORMAT) return fail("This is not a Sloth & Llama project file.");
    if (data.formatVersion !== PROJECT_FILE_VERSION) {
      return fail(
        typeof data.formatVersion === "number" && data.formatVersion > PROJECT_FILE_VERSION
          ? "This file was made by a newer version of the tool and cannot be imported."
          : "The file's format version is not supported.",
      );
    }
    raw = data.project;
    if (!isRecord(raw)) return fail("The file does not contain a project.");
  }
  const source = raw as Record<string, unknown>;

  const picked: Record<string, unknown> = { id: "" };
  for (const key of KNOWN_FIELDS) if (source[key] !== undefined) picked[key] = source[key];
  // withCurrentDefaults needs a settings object to read from.
  if (!isRecord(picked.settings)) return fail(...describeIssues(validateProject(picked)));

  let project: NameArtProject;
  try {
    project = withCurrentDefaults(picked as unknown as NameArtProject);
  } catch {
    return fail("The project in the file could not be read.");
  }
  project = { ...project, id: "" };
  const issues = validateProject(project);
  if (issues.length > 0) return fail(...describeIssues(issues));
  return { ok: true, project };
}

function describeIssues(issues: ReturnType<typeof validateProject>): string[] {
  const shown = issues.slice(0, MAX_MESSAGES).map((i) => (i.field ? `${i.field}: ${i.message}` : i.message));
  if (issues.length > MAX_MESSAGES) shown.push(`…and ${issues.length - MAX_MESSAGES} more problems.`);
  return ["The project in the file is not valid.", ...shown];
}
