// HTTP contract between the React app and the local service.
//
//   GET    /api/health            -> { ok: true }
//   GET    /api/projects          -> ProjectSummary[]   (newest updatedAt first)
//   POST   /api/projects          body NameArtProject (id ignored) -> 201 ProjectRecord
//   GET    /api/projects/:id      -> ProjectRecord | 404
//   PUT    /api/projects/:id      body NameArtProject -> ProjectRecord | 404
//   DELETE /api/projects/:id      -> 204 | 404
//   GET    /api/fonts             -> FontSummary[]      (sorted by name, no bytes)
//   POST   /api/fonts             body raw font file (application/octet-stream)
//                                 -> 201 FontSummary (added) | 200 FontSummary (already stored)
//                                 | 400 not a usable TTF/OTF font | 409 library full | 413 over MAX_FONT_BYTES
//                                 | 503 too many uploads being checked at once
//   GET    /api/fonts/:id         -> font bytes (application/octet-stream) | 400 bad id | 404
//   DELETE /api/fonts/:id         -> 204 | 400 bad id | 404
//
// Bodies must be sent as application/json, except POST /api/fonts. Requests whose
// Host or Origin is not local are refused with 403.
// Errors use ApiError with status 400 (validation), 403, 404, 405, 409, 413, 415, 500 or 503.

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

// WOFF is refused: opentype.js's bundled inflater can loop forever on malformed data.
export type FontFormat = "ttf" | "otf";

// A font the user added to the local library; the bytes are fetched separately.
export interface FontSummary {
  id: string; // "lib-" + first 32 hex chars of the SHA-256 of the file bytes
  name: string; // from the font's own name table, plain text
  format: FontFormat;
  sizeBytes: number;
  addedAt: string; // ISO 8601 UTC
}

export const MAX_FONT_BYTES = 10 * 1024 * 1024;
export const MAX_LIBRARY_FONTS = 500;
export const MAX_FONT_NAME_LENGTH = 80;

const LIBRARY_FONT_ID = /^lib-[0-9a-f]{32}$/;

export function isLibraryFontId(id: unknown): id is string {
  return typeof id === "string" && LIBRARY_FONT_ID.test(id);
}
