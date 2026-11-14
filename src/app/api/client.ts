import type { ApiError, ProjectRecord, ProjectSummary } from "../../core/api.ts";
import type { NameArtProject } from "../../core/models/project.ts";
import type { ValidationIssue } from "../../core/models/validation.ts";

export class ApiRequestError extends Error {
  readonly issues: ValidationIssue[];
  readonly status: number;
  constructor(status: number, body: ApiError) {
    super(body.error);
    this.status = status;
    this.issues = body.issues ?? [];
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = init?.body ? { "Content-Type": "application/json" } : undefined;
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let body: ApiError;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      body = { error: `Request failed (${res.status})` };
    }
    throw new ApiRequestError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ ok: true }>("/api/health"),
  listProjects: () => request<ProjectSummary[]>("/api/projects"),
  getProject: (id: string) => request<ProjectRecord>(`/api/projects/${encodeURIComponent(id)}`),
  createProject: (project: NameArtProject) =>
    request<ProjectRecord>("/api/projects", { method: "POST", body: JSON.stringify(project) }),
  updateProject: (id: string, project: NameArtProject) =>
    request<ProjectRecord>(`/api/projects/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(project),
    }),
  deleteProject: (id: string) =>
    request<void>(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
