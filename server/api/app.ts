import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { MAX_REQUEST_BYTES } from "../../src/core/api.ts";
import type { ApiError } from "../../src/core/api.ts";
import { validateProject } from "../../src/core/models/validation.ts";
import type { ProjectRepository } from "../database/projectRepository.ts";

export interface AppOptions {
  repository: ProjectRepository;
  staticDir?: string;
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

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  // Keep draining an oversized body (without storing it) so the client can read the 413.
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size <= MAX_REQUEST_BYTES) chunks.push(chunk as Buffer);
  }
  if (size > MAX_REQUEST_BYTES) throw new HttpError(413, "Request body too large");
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

async function handleApi(
  repository: ProjectRepository,
  req: IncomingMessage,
  res: ServerResponse,
  segments: string[],
): Promise<void> {
  const method = req.method ?? "GET";
  const [resource, rawId, ...rest] = segments;

  if (resource === "health" && segments.length === 1 && method === "GET") {
    return sendJson(res, 200, { ok: true });
  }
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
  const { repository, staticDir } = options;
  const serveFiles = staticDir !== undefined && existsSync(staticDir);

  return async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments[0] === "api") {
        assertLocalRequest(req);
        await handleApi(repository, req, res, segments.slice(1));
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
