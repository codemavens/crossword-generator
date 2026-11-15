import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFontInspector, QueueFullError, UNREADABLE_FONT } from "../../server/fonts/fontInspector.ts";
import { createSerialQueue, runWorkerJob } from "../../server/fonts/workerJob.ts";
import { hangingWoff } from "./fixtures/maliciousWoff.ts";

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);
const zilla = new Uint8Array(readFileSync(join(import.meta.dirname, "../../public/fonts/ZillaSlab-SemiBold.ttf")));

test("the real worker inspects a bundled font", async () => {
  const inspect = createFontInspector();
  assert.deepEqual(await inspect(zilla), { ok: true, name: "Zilla Slab SemiBold", format: "ttf" });
  assert.equal(zilla.byteLength > 0, true, "caller's bytes are not detached");
});

test("the real worker refuses the hanging WOFF quickly", async () => {
  const started = Date.now();
  const result = await createFontInspector()(hangingWoff());
  assert.equal(result.ok, false);
  assert.ok(!result.ok && /WOFF/.test(result.message));
  assert.ok(Date.now() - started < 3000);
});

test("a parse that hangs inside opentype.js is cut off by the timeout", async () => {
  const inspect = createFontInspector({ timeoutMs: 500, workerEntry: fixture("rawParseWorker.ts") });
  const started = Date.now();
  assert.deepEqual(await inspect(hangingWoff()), { ok: false, message: UNREADABLE_FONT });
  assert.ok(Date.now() - started < 3000);
});

test("a hanging, throwing or memory-hungry worker becomes a refusal", async () => {
  for (const [name, limitMb] of [["hangWorker.ts", 64], ["throwWorker.ts", 64], ["memoryWorker.ts", 32]] as const) {
    const inspect = createFontInspector({ timeoutMs: 1500, maxOldGenerationSizeMb: limitMb, workerEntry: fixture(name) });
    assert.deepEqual(await inspect(zilla), { ok: false, message: UNREADABLE_FONT }, name);
  }
});

test("runWorkerJob reports why a job failed", async () => {
  const opts = { timeoutMs: 300 };
  assert.deepEqual(await runWorkerJob(fixture("hangWorker.ts"), new ArrayBuffer(1), opts), { ok: false, reason: "timeout" });
  assert.deepEqual(await runWorkerJob(fixture("throwWorker.ts"), new ArrayBuffer(1), { timeoutMs: 3000 }), {
    ok: false,
    reason: "error",
  });
});

test("the serial queue runs one job at a time and refuses beyond its backlog", async () => {
  const enqueue = createSerialQueue(2);
  let running = 0;
  let maxRunning = 0;
  const job = () => async () => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((r) => setTimeout(r, 20));
    running--;
    return "done";
  };
  const a = enqueue(job());
  const b = enqueue(job());
  await assert.rejects(enqueue(job()), QueueFullError);
  assert.deepEqual(await Promise.all([a, b]), ["done", "done"]);
  assert.equal(maxRunning, 1);
  assert.equal(await enqueue(job()), "done"); // room again
  await assert.rejects(enqueue(() => Promise.reject(new Error("x"))), /x/);
  assert.equal(await enqueue(job()), "done"); // a failed job does not jam the queue
});
