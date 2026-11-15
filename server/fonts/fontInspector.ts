import type { FontInspection } from "../../src/core/typography/inspectFont.ts";
import { createSerialQueue, QueueFullError, runWorkerJob } from "./workerJob.ts";

export type InspectUpload = (bytes: Uint8Array) => Promise<FontInspection>;

export interface FontInspectorOptions {
  timeoutMs?: number;
  maxOldGenerationSizeMb?: number;
  maxPending?: number;
  workerEntry?: URL; // tests inject a hanging or crashing worker
}

export const UNREADABLE_FONT = "This font could not be read.";
export { QueueFullError };

const DEFAULT_ENTRY = new URL("./inspectWorker.ts", import.meta.url);

function isInspection(value: unknown): value is FontInspection {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.ok === true) return typeof v.name === "string" && (v.format === "ttf" || v.format === "otf");
  return v.ok === false && typeof v.message === "string";
}

// Inspects untrusted font bytes off the event loop, one upload at a time, with time and memory limits.
export function createFontInspector(options: FontInspectorOptions = {}): InspectUpload {
  const enqueue = createSerialQueue(options.maxPending ?? 4);
  const entry = options.workerEntry ?? DEFAULT_ENTRY;
  const jobOptions = {
    timeoutMs: options.timeoutMs ?? 3000,
    resourceLimits: {
      maxOldGenerationSizeMb: options.maxOldGenerationSizeMb ?? 768, // all outlines of a 23 MB font took ~1 GB; fonts are capped at 10 MB
      maxYoungGenerationSizeMb: 32,
    },
  };
  return (bytes) =>
    enqueue(async () => {
      const copy = bytes.slice().buffer; // standalone buffer, transferred to the worker
      const outcome = await runWorkerJob<unknown>(entry, copy, jobOptions);
      if (outcome.ok && isInspection(outcome.value)) return outcome.value;
      return { ok: false, message: UNREADABLE_FONT };
    });
}
