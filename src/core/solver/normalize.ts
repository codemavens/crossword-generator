import type { NameEntry } from "../models/project.ts";
import { normalizeNameText } from "../models/validation.ts";
import type { NameProblem } from "./types.ts";

export interface NormalizedName {
  id: string;
  // Trimmed original text, for messages.
  display: string;
  chars: string[];
}

export interface NormalizeResult {
  names: NormalizedName[];
  problems: NameProblem[];
}

export function normalizeNames(entries: NameEntry[]): NormalizeResult {
  const names: NormalizedName[] = [];
  const problems: NameProblem[] = [];
  for (const entry of entries) {
    const result = normalizeNameText(entry.text);
    if (result.ok) names.push({ id: entry.id, display: entry.text.trim(), chars: result.chars });
    else problems.push({ nameId: entry.id, message: result.message });
  }
  return { names, problems };
}
