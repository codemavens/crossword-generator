import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createApp } from "../../server/api/app.ts";
import { SqliteProjectRepository } from "../../server/database/projectRepository.ts";
import { SqliteFontRepository } from "../../server/database/fontRepository.ts";
import { MAX_FONT_BYTES } from "../../src/core/api.ts";
import type { ApiError, FontSummary } from "../../src/core/api.ts";
import { newProject } from "../../src/core/models/defaults.ts";

const LIMIT = 3;
const fontsDir = join(import.meta.dirname, "../../public/fonts");
const pacifico = readFileSync(join(fontsDir, "Pacifico-Regular.ttf"));
const zilla = readFileSync(join(fontsDir, "ZillaSlab-SemiBold.ttf"));

let server: Server;
let base: string;
let projects: SqliteProjectRepository;
let fonts: SqliteFontRepository;

// Trailing bytes give a different file (and id) that still parses as the same font.
function variant(bytes: Buffer, n: number): Buffer {
  return Buffer.concat([bytes, Buffer.alloc(4 + n, n)]);
}

function expectedId(bytes: Uint8Array): string {
  return `lib-${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}`;
}

function upload(bytes: Uint8Array, contentType = "application/octet-stream", headers: Record<string, string> = {}) {
  return fetch(base + "/api/fonts", {
    method: "POST",
    headers: { "content-type": contentType, ...headers },
    body: bytes,
  });
}

function rawStatus(method: string, path: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = new URL(base);
    const req = request({ host: url.hostname, port: url.port, method, path, headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

before(async () => {
  projects = new SqliteProjectRepository(":memory:");
  fonts = new SqliteFontRepository(":memory:");
  server = createServer(createApp({ repository: projects, fonts, maxLibraryFonts: LIMIT }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  projects.close();
  fonts.close();
});

test("upload, duplicate upload, list, download and delete", async () => {
  const created = await upload(zilla);
  assert.equal(created.status, 201);
  const summary = (await created.json()) as FontSummary;
  assert.equal(summary.id, expectedId(zilla));
  assert.equal(summary.name, "Zilla Slab SemiBold");
  assert.equal(summary.format, "ttf");
  assert.equal(summary.sizeBytes, zilla.length);
  assert.ok(!Number.isNaN(Date.parse(summary.addedAt)));

  const again = await upload(zilla);
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), summary);

  const second = await upload(pacifico);
  assert.equal(second.status, 201);
  const pac = (await second.json()) as FontSummary;

  const list = await fetch(base + "/api/fonts");
  assert.equal(list.status, 200);
  const items = (await list.json()) as FontSummary[];
  assert.deepEqual(items, [pac, summary]); // sorted by name
  for (const item of items) assert.equal("bytes" in item, false);

  const download = await fetch(`${base}/api/fonts/${summary.id}`);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/octet-stream");
  assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  assert.match(download.headers.get("content-disposition") ?? "", /^attachment/);
  assert.match(download.headers.get("cache-control") ?? "", /immutable/);
  const bytes = Buffer.from(await download.arrayBuffer());
  assert.ok(bytes.equals(zilla), "download must round-trip byte for byte");

  const del = await fetch(`${base}/api/fonts/${summary.id}`, { method: "DELETE" });
  assert.equal(del.status, 204);
  assert.equal((await fetch(`${base}/api/fonts/${summary.id}`)).status, 404);
  assert.equal((await fetch(`${base}/api/fonts/${summary.id}`, { method: "DELETE" })).status, 404);
  assert.equal((await fetch(`${base}/api/fonts/${pac.id}`, { method: "DELETE" })).status, 204);
});

test("413 for a font over the size limit, and nothing is stored", async () => {
  const before = fonts.count();
  const huge = Buffer.concat([zilla, Buffer.alloc(MAX_FONT_BYTES)]);
  const res = await upload(huge);
  assert.equal(res.status, 413);
  assert.ok(((await res.json()) as ApiError).error);
  assert.equal(fonts.count(), before);
});

test("400 with a message for files that are not fonts", async () => {
  const before = fonts.count();
  for (const bytes of [Buffer.from("hello, not a font"), Buffer.alloc(0), zilla.subarray(0, 4000), Buffer.from("wOF2xxxxxxxxxxxx")]) {
    const res = await upload(bytes);
    assert.equal(res.status, 400);
    const error = (await res.json()) as ApiError;
    assert.ok(error.error.length > 0);
  }
  assert.equal(fonts.count(), before);
});

test("400 for a malformed id and 404 for a missing font", async () => {
  for (const id of ["nope", "lib-123", `lib-${"A".repeat(32)}`, "..%2f..%2fetc%2fpasswd", `lib-${"a".repeat(33)}`]) {
    assert.equal((await fetch(`${base}/api/fonts/${id}`)).status, 400, id);
    assert.equal((await fetch(`${base}/api/fonts/${id}`, { method: "DELETE" })).status, 400, id);
  }
  const missing = `lib-${"0".repeat(32)}`;
  assert.equal((await fetch(`${base}/api/fonts/${missing}`)).status, 404);
  assert.equal((await fetch(`${base}/api/fonts/${missing}`, { method: "DELETE" })).status, 404);
  assert.equal((await fetch(`${base}/api/fonts/${missing}/extra`)).status, 404);
  assert.equal((await fetch(`${base}/api/fonts`, { method: "PUT" })).status, 405);
});

test("POST /api/fonts refuses JSON and other content types", async () => {
  const json = await upload(Buffer.from(JSON.stringify({ font: "x" })), "application/json");
  assert.equal(json.status, 415);
  assert.equal((await upload(zilla, "text/plain")).status, 415);
  assert.equal((await upload(zilla, "font/ttf")).status, 415);
});

test("JSON routes still refuse an octet-stream body", async () => {
  const res = await fetch(base + "/api/projects", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: JSON.stringify({ ...newProject(), projectName: "X" }),
  });
  assert.equal(res.status, 415);
});

test("font routes refuse a non-local Origin or Host", async () => {
  const evil = { origin: "https://evil.example" };
  assert.equal((await fetch(base + "/api/fonts", { headers: evil })).status, 403);
  assert.equal((await upload(zilla, "application/octet-stream", evil)).status, 403);
  const id = `lib-${"0".repeat(32)}`;
  assert.equal((await fetch(`${base}/api/fonts/${id}`, { headers: evil })).status, 403);
  assert.equal((await fetch(`${base}/api/fonts/${id}`, { method: "DELETE", headers: evil })).status, 403);

  const host = { host: "evil.example" };
  assert.equal(await rawStatus("GET", "/api/fonts", host), 403);
  assert.equal(await rawStatus("GET", `/api/fonts/${id}`, host), 403);
  assert.equal(await rawStatus("DELETE", `/api/fonts/${id}`, host), 403);
  assert.equal(await rawStatus("POST", "/api/fonts", { ...host, "content-type": "application/octet-stream" }), 403);
  assert.equal(fonts.count(), 0);
});

test("409 when the library is full; a stored font can still be re-uploaded", async () => {
  const added: string[] = [];
  for (let i = 0; i < LIMIT; i++) {
    const res = await upload(variant(pacifico, i));
    assert.equal(res.status, 201);
    added.push(((await res.json()) as FontSummary).id);
  }
  const full = await upload(variant(pacifico, 99));
  assert.equal(full.status, 409);
  assert.match(((await full.json()) as ApiError).error, /full/i);
  assert.equal(fonts.count(), LIMIT);

  assert.equal((await upload(variant(pacifico, 0))).status, 200);
  for (const id of added) assert.equal((await fetch(`${base}/api/fonts/${id}`, { method: "DELETE" })).status, 204);
});
