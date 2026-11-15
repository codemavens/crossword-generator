// Download file names: ASCII letters, digits, "-" and "_" only, so user text never shapes a path.
export const MAX_FILE_STEM_LENGTH = 60;
export const FALLBACK_FILE_STEM = "design";

export function safeFileStem(projectName: string): string {
  const stem = String(projectName ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, MAX_FILE_STEM_LENGTH)
    .replace(/^[-_]+|[-_]+$/g, "");
  return stem.length > 0 ? stem : FALLBACK_FILE_STEM;
}
