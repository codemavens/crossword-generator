import type { ProjectSummary } from "../api.ts";

// Case-insensitive match of the trimmed query against project and customer name; an empty query keeps everything.
export function filterProjects(projects: readonly ProjectSummary[], query: string): ProjectSummary[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...projects];
  return projects.filter((p) => p.projectName.toLowerCase().includes(q) || (p.customerName ?? "").toLowerCase().includes(q));
}
