import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import type { Server } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../server/api/app.ts";
import { SqliteProjectRepository } from "../../server/database/projectRepository.ts";
import { MAX_REQUEST_BYTES } from "../../src/core/api.ts";
import type { ProjectRecord, ApiError } from "../../src/core/api.ts";
import { newProject } from "../../src/core/models/defaults.ts";

let server: Server;
let base: string;
let tmp: string;
let repository: SqliteProjectRepository;

function body(name = "Smith Family") {
  return { ...newProject(), projectName: name, familyName: "Smith" };
}

function send(path: string, method: string, payload?: unknown) {
  return fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "sloth-app-"));
  const staticDir = join(tmp, "dist");
  mkdirSync(staticDir);
  writeFileSync(join(staticDir, "index.html"), "<html>app</html>");
  writeFileSync(join(staticDir, "app.js"), "console.log(1)");
  writeFileSync(join(tmp, "secret.txt"), "secret");
  repository = new SqliteProjectRepository(":memory:");
  server = createServer(createApp({ repository, staticDir }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  repository.close();
  rmSync(tmp, { recursive: true, force: true });
});

test("health", async () => {
  const res = await fetch(base + "/api/health");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await res.json(), { ok: true });
});

test("project CRUD round trip", async () => {
  const created = await send("/api/projects", "POST", body());
  assert.equal(created.status, 201);
  const record = (await created.json()) as ProjectRecord;
  assert.equal(record.projectName, "Smith Family");
  assert.equal(record.project.id, record.id);

  const got = await fetch(`${base}/api/projects/${record.id}`);
  assert.equal(got.status, 200);
  assert.deepEqual(await got.json(), record);

  const list = (await (await fetch(base + "/api/projects")).json()) as { id: string }[];
  assert.ok(list.some((p) => p.id === record.id));
  assert.equal("project" in (list[0] as object), false);

  const put = await send(`/api/projects/${record.id}`, "PUT", { ...body("Renamed"), id: "x" });
  assert.equal(put.status, 200);
  const updated = (await put.json()) as ProjectRecord;
  assert.equal(updated.id, record.id);
  assert.equal(updated.projectName, "Renamed");

  const del = await send(`/api/projects/${record.id}`, "DELETE");
  assert.equal(del.status, 204);
  assert.equal((await fetch(`${base}/api/projects/${record.id}`)).status, 404);
});

test("400 with issues for a one-character name", async () => {
  const project = { ...body(), names: [{ id: "n1", text: "A" }] };
  const res = await send("/api/projects", "POST", project);
  assert.equal(res.status, 400);
  const error = (await res.json()) as ApiError;
  assert.ok(error.issues?.some((i) => i.field === "names.0.text"));
  const put = await send("/api/projects/whatever", "PUT", project);
  assert.equal(put.status, 400);
});

test("400 on a body that does not parse as JSON", async () => {
  const bad = await fetch(base + "/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: "{nope" });
  assert.equal(bad.status, 400);
  const text = await fetch(base + "/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: "hello" });
  assert.equal(text.status, 400);
  assert.ok(((await text.json()) as ApiError).error);
});

test("404s for missing projects and unknown api routes", async () => {
  assert.equal((await fetch(base + "/api/projects/missing")).status, 404);
  assert.equal((await send("/api/projects/missing", "PUT", body())).status, 404);
  assert.equal((await send("/api/projects/missing", "DELETE")).status, 404);
  const unknown = await fetch(base + "/api/nothing");
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get("content-type") ?? "", /application\/json/);
  assert.ok(((await unknown.json()) as ApiError).error);
});

test("413 on an oversized body", async () => {
  const huge = JSON.stringify({ pad: "x".repeat(MAX_REQUEST_BYTES + 10) });
  const res = await fetch(base + "/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: huge });
  assert.equal(res.status, 413);
});

test("static files with index fallback and content types", async () => {
  const index = await fetch(base + "/");
  assert.equal(index.status, 200);
  assert.match(index.headers.get("content-type") ?? "", /text\/html/);
  assert.equal(await index.text(), "<html>app</html>");
  const js = await fetch(base + "/app.js");
  assert.match(js.headers.get("content-type") ?? "", /javascript/);
  const spa = await fetch(base + "/some/client/route");
  assert.equal(await spa.text(), "<html>app</html>");
});

test("path traversal does not escape the static directory", async () => {
  for (const path of ["/../secret.txt", "/%2e%2e/secret.txt", "/..%2fsecret.txt", "/%2e%2e%2fsecret.txt"]) {
    const res = await fetch(base + path);
    assert.doesNotMatch(await res.text(), /secret/, path);
  }
});

test("refuses requests from a non-local origin", async () => {
  const res = await fetch(base + "/api/projects", { headers: { origin: "https://evil.example" } });
  assert.equal(res.status, 403);
  const ok = await fetch(base + "/api/projects", { headers: { origin: "http://localhost:5173" } });
  assert.equal(ok.status, 200);
});

test("refuses requests with a non-local Host header", async () => {
  const status = await new Promise<number>((resolve, reject) => {
    const url = new URL(base);
    const req = request(
      { host: url.hostname, port: url.port, path: "/api/projects", headers: { host: "evil.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(status, 403);
});

test("refuses a body that is not sent as JSON", async () => {
  const res = await fetch(base + "/api/projects", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify(body()),
  });
  assert.equal(res.status, 415);
});

test("a malformed id is a 400, not a 500", async () => {
  const res = await fetch(base + "/api/projects/%E0%A4%A");
  assert.equal(res.status, 400);
});
