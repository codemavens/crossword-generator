// HTTP contract between the React app and the local service.
//
//   GET    /api/health            -> { ok: true }
//   GET    /api/projects          -> ProjectSummary[]   (newest updatedAt first)
//   POST   /api/projects          body NameArtProject (id ignored) -> 201 ProjectRecord
//   GET    /api/projects/:id      -> ProjectRecord | 404
//   PUT    /api/projects/:id      body NameArtProject -> ProjectRecord | 404
//   DELETE /api/projects/:id      -> 204 | 404
//
// Bodies must be sent as application/json. Requests whose Host or Origin is not
// local are refused with 403.
// Errors use ApiError with status 400 (validation), 403, 404, 405, 413, 415 or 500.

import type { NameArtProject } from "./models/project.ts";
import type { ValidationIssue } from "./models/validation.ts";

export interface ProjectSummary {
  id: string;
  projectName: string;
  customerName: string | null;
  createdAt: string; // ISO 8601 UTC
  updatedAt: string;
}

export interface ProjectRecord extends ProjectSummary {
  schemaVersion: number;
  project: NameArtProject;
}

export interface ApiError {
  error: string;
  issues?: ValidationIssue[];
}

export const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
