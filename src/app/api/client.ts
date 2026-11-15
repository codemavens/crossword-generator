import type { ApiError, FontSummary, ProjectRecord, ProjectSummary } from "../../core/api.ts";
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

async function failure(res: Response): Promise<ApiRequestError> {
  let body: ApiError;
  try {
    body = (await res.json()) as ApiError;
  } catch {
    body = { error: `Request failed (${res.status})` };
  }
  if (typeof body?.error !== "string") body = { error: `Request failed (${res.status})` };
  return new ApiRequestError(res.status, body);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = init?.body ? { "Content-Type": "application/json" } : undefined;
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) throw await failure(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface AddFontResult {
  font: FontSummary;
  // false when the same file was already in the library.
  added: boolean;
}

async function addFont(bytes: ArrayBuffer): Promise<AddFontResult> {
  const res = await fetch("/api/fonts", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  if (!res.ok) throw await failure(res);
  return { font: (await res.json()) as FontSummary, added: res.status === 201 };
}

async function getFontBytes(id: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(`/api/fonts/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) throw await failure(res);
  return res.arrayBuffer();
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
  listFonts: () => request<FontSummary[]>("/api/fonts"),
  addFont,
  getFontBytes,
  deleteFont: (id: string) => request<void>(`/api/fonts/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
