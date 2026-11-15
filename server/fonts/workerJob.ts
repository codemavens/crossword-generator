import { Worker } from "node:worker_threads";
import type { ResourceLimits } from "node:worker_threads";

export type WorkerOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "timeout" | "error" | "exit" };

export interface WorkerJobOptions {
  timeoutMs: number;
  resourceLimits?: ResourceLimits;
}

// Runs one job in a fresh worker (workerData in, one message out). Resolves only after the
// worker has been terminated, so a hung or crashed job never outlives its promise.
export function runWorkerJob<T>(
  entry: URL,
  input: ArrayBuffer,
  options: WorkerJobOptions,
): Promise<WorkerOutcome<T>> {
  return new Promise((resolve) => {
    let outcome: WorkerOutcome<T> | undefined;
    let worker: Worker;
    try {
      worker = new Worker(entry, {
        workerData: input,
        transferList: [input],
        resourceLimits: options.resourceLimits,
        stdout: true, // keep a hostile job's output out of the service log
        stderr: true,
      });
    } catch {
      resolve({ ok: false, reason: "error" });
      return;
    }
    worker.stdout.resume();
    worker.stderr.resume();
    const finish = (result: WorkerOutcome<T>): void => {
      if (outcome) return;
      outcome = result;
      clearTimeout(timer);
      worker.terminate().then(
        () => resolve(result),
        () => resolve(result),
      );
    };
    const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), options.timeoutMs);
    worker.once("message", (value: T) => finish({ ok: true, value }));
    worker.once("error", () => finish({ ok: false, reason: "error" }));
    worker.once("exit", () => finish({ ok: false, reason: "exit" }));
  });
}

export class QueueFullError extends Error {}

// Runs jobs one at a time; refuses new work once `maxPending` jobs are waiting or running.
export function createSerialQueue(maxPending: number) {
  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0;
  return function enqueue<T>(job: () => Promise<T>): Promise<T> {
    if (pending >= maxPending) return Promise.reject(new QueueFullError("Queue is full"));
    pending++;
    const run = tail.then(job).finally(() => {
      pending--;
    });
    tail = run.catch(() => undefined);
    return run;
  };
}
