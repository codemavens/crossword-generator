import type { NameArtProject } from "./project.ts";
import { MAX_TEXT_LENGTH } from "./validation.ts";

export const COPY_SUFFIX = " (copy)";

// An independent deep copy for the create route: blank id (the server assigns a new one) and a marked name.
export function duplicateProject(source: NameArtProject): NameArtProject {
  const copy = JSON.parse(JSON.stringify(source)) as NameArtProject;
  const base = source.projectName.trim().slice(0, MAX_TEXT_LENGTH - COPY_SUFFIX.length);
  return { ...copy, id: "", projectName: `${base}${COPY_SUFFIX}` };
}
