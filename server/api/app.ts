import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import {
  isLibraryFontId,
  MAX_FONT_BYTES,
  MAX_LIBRARY_FONTS,
  MAX_REQUEST_BYTES,
} from "../../src/core/api.ts";
import type { ApiError, FontSummary } from "../../src/core/api.ts";
import { validateProject } from "../../src/core/models/validation.ts";
import { createFontInspector, QueueFullError } from "../fonts/fontInspector.ts";
import type { InspectUpload } from "../fonts/fontInspector.ts";
import type { FontRepository } from "../database/fontRepository.ts";
import type { ProjectRepository } from "../database/projectRepository.ts";

export interface AppOptions {
  repository: ProjectRepository;
  fonts: FontRepository;
  staticDir?: string;
  maxLibraryFonts?: number; // overridable for tests
  inspectUpload?: InspectUpload; // defaults to a worker with time and memory limits
}

interface ApiContext {
  repository: ProjectRepository;
  fonts: FontRepository;
  maxLibraryFonts: number;
  inspectUpload: InspectUpload;
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendError(res: ServerResponse, status: number, error: string, issues?: ApiError["issues"]) {
  const body: ApiError = issues ? { error, issues } : { error };
  sendJson(res, status, body);
}

async function readBody(req: IncomingMessage, limit = MAX_REQUEST_BYTES): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  // Keep draining an oversized body (without storing it) so the client can read the 413.
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size <= limit) chunks.push(chunk as Buffer);
  }
  if (size > limit) throw new HttpError(413, "Request body too large");
  return Buffer.concat(chunks);
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function isLocalHost(value: string, isUrl: boolean): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(isUrl ? value : `http://${value}`).hostname);
  } catch {
    return false;
  }
}

// Blocks DNS rebinding and cross-site requests from other pages in the browser.
function assertLocalRequest(req: IncomingMessage): void {
  const { host, origin } = req.headers;
  if (!host || !isLocalHost(host, false)) throw new HttpError(403, "Forbidden");
  if (origin !== undefined && !isLocalHost(origin, true)) throw new HttpError(403, "Forbidden");
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  // Requiring JSON forces a CORS preflight, which other sites cannot pass.
  if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) {
    req.resume();
    throw new HttpError(415, "Content-Type must be application/json");
  }
  const body = await readBody(req);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpError(400, "Body must be valid JSON");
  }
}

async function readProject(req: IncomingMessage) {
  const input = await readJson(req);
  const issues = validateProject(input);
  if (issues.length > 0) throw new ValidationFailure(issues);
  return input as Parameters<ProjectRepository["create"]>[0];
}

class ValidationFailure extends Error {
  readonly issues: NonNullable<ApiError["issues"]>;
  constructor(issues: NonNullable<ApiError["issues"]>) {
    super("Invalid project");
    this.issues = issues;
  }
}

const MB = 1024 * 1024;

async function readFontUpload(req: IncomingMessage): Promise<Buffer> {
  // Not a CORS-safelisted type either, so cross-site pages still need a preflight they cannot pass.
  if (!/^application\/octet-stream\b/i.test(req.headers["content-type"] ?? "")) {
    req.resume();
    throw new HttpError(415, "Content-Type must be application/octet-stream");
  }
  try {
    return await readBody(req, MAX_FONT_BYTES);
  } catch (error) {
    if (error instanceof HttpError && error.status === 413) {
      throw new HttpError(413, `Font files can be at most ${MAX_FONT_BYTES / MB} MB.`);
    }
    throw error;
  }
}

// Stores an uploaded font under a content-hash id; the name comes only from the font itself.
async function addFont(ctx: ApiContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readFontUpload(req);
  const bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  const id = `lib-${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}`;
  const existing = ctx.fonts.get(id);
  if (existing) return sendJson(res, 200, existing.summary); // these exact bytes already passed

  let inspection;
  try {
    inspection = await ctx.inspectUpload(bytes);
  } catch (error) {
    if (error instanceof QueueFullError) throw new HttpError(503, "Too many fonts are being checked. Try again shortly.");
    throw error;
  }
  if (!inspection.ok) throw new HttpError(400, inspection.message);
  if (ctx.fonts.count() >= ctx.maxLibraryFonts) {
    throw new HttpError(409, `The font library is full (${ctx.maxLibraryFonts} fonts). Remove a font first.`);
  }
  const summary: FontSummary = {
    id,
    name: inspection.name,
    format: inspection.format,
    sizeBytes: bytes.byteLength,
    addedAt: new Date().toISOString(),
  };
  if (ctx.fonts.add(summary, bytes) === "exists") {
    return sendJson(res, 200, ctx.fonts.get(id)?.summary ?? summary);
  }
  sendJson(res, 201, summary);
}

async function handleFonts(
  ctx: ApiContext,
  req: IncomingMessage,
  res: ServerResponse,
  rawId: string | undefined,
): Promise<void> {
  const method = req.method ?? "GET";
  if (rawId === undefined) {
    if (method === "GET") return sendJson(res, 200, ctx.fonts.list());
    if (method === "POST") return addFont(ctx, req, res);
    throw new HttpError(405, "Method not allowed");
  }
  if (!isLibraryFontId(rawId)) throw new HttpError(400, "Bad font id");
  if (method === "GET") {
    const font = ctx.fonts.get(rawId);
    if (!font) throw new HttpError(404, "Font not found");
    // Served only as binary data to parse, never as a page; the id is a content hash.
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": font.bytes.byteLength,
      "content-disposition": "attachment",
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=31536000, immutable",
    });
    res.end(font.bytes);
    return;
  }
  if (method === "DELETE") {
    if (!ctx.fonts.remove(rawId)) throw new HttpError(404, "Font not found");
    res.writeHead(204);
    res.end();
    return;
  }
  throw new HttpError(405, "Method not allowed");
}

async function handleApi(
  ctx: ApiContext,
  req: IncomingMessage,
  res: ServerResponse,
  segments: string[],
): Promise<void> {
  const { repository } = ctx;
  const method = req.method ?? "GET";
  const [resource, rawId, ...rest] = segments;

  if (resource === "health" && segments.length === 1 && method === "GET") {
    return sendJson(res, 200, { ok: true });
  }
  if (resource === "fonts" && rest.length === 0) return handleFonts(ctx, req, res, rawId);
  if (resource !== "projects" || rest.length > 0) throw new HttpError(404, "Not found");

  if (rawId === undefined) {
    if (method === "GET") return sendJson(res, 200, repository.list());
    if (method === "POST") {
      return sendJson(res, 201, repository.create(await readProject(req)));
    }
    throw new HttpError(405, "Method not allowed");
  }

  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    throw new HttpError(400, "Bad project id");
  }
  if (method === "GET") {
    const record = repository.get(id);
    if (!record) throw new HttpError(404, "Project not found");
    return sendJson(res, 200, record);
  }
  if (method === "PUT") {
    const project = await readProject(req);
    const record = repository.update(id, project);
    if (!record) throw new HttpError(404, "Project not found");
    return sendJson(res, 200, record);
  }
  if (method === "DELETE") {
    if (!repository.delete(id)) throw new HttpError(404, "Project not found");
    res.writeHead(204);
    res.end();
    return;
  }
  throw new HttpError(405, "Method not allowed");
}

async function serveStatic(staticDir: string, pathname: string, res: ServerResponse) {
  const root = resolve(staticDir);
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return sendError(res, 400, "Bad request path");
  }
  let file = resolve(join(root, decoded));
  if (file !== root && !file.startsWith(root + sep)) return sendError(res, 404, "Not found");
  const isFile = (path: string) => existsSync(path) && statSync(path).isFile();
  if (!isFile(file)) file = join(root, "index.html"); // SPA fallback
  if (!isFile(file)) return sendError(res, 404, "Not found");
  const data = await readFile(file);
  res.writeHead(200, {
    "content-type": CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "content-length": data.length,
  });
  res.end(data);
}

export function createApp(options: AppOptions): RequestListener {
  const { repository, fonts, staticDir } = options;
  const ctx: ApiContext = {
    repository,
    fonts,
    maxLibraryFonts: options.maxLibraryFonts ?? MAX_LIBRARY_FONTS,
    inspectUpload: options.inspectUpload ?? createFontInspector(),
  };
  const serveFiles = staticDir !== undefined && existsSync(staticDir);

  return async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments[0] === "api") {
        assertLocalRequest(req);
        await handleApi(ctx, req, res, segments.slice(1));
      } else if (serveFiles && (req.method === "GET" || req.method === "HEAD")) {
        await serveStatic(staticDir, url.pathname, res);
      } else {
        sendError(res, 404, "Not found");
      }
    } catch (error) {
      if (error instanceof ValidationFailure) {
        sendError(res, 400, error.message, error.issues);
      } else if (error instanceof HttpError) {
        sendError(res, error.status, error.message);
      } else {
        console.error("Unhandled request error:", error instanceof Error ? error.message : error);
        if (!res.headersSent) sendError(res, 500, "Internal error");
        else res.end();
      }
    }
  };
}
