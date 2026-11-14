import type { SolveInput, SolveResult } from "../../core/solver/index.ts";
import type { WorkerReply, WorkerRequest } from "./solver.worker.ts";

export interface SolverClient {
  // Resolves null when superseded by a newer call or disposed.
  solve(input: SolveInput): Promise<SolveResult | null>;
  dispose(): void;
}

export function createSolverClient(): SolverClient {
  let worker: Worker | null = null;
  let pending: { id: number; resolve: (r: SolveResult | null) => void; reject: (e: Error) => void } | null = null;
  let counter = 0;

  // The search is synchronous inside the worker, so cancelling means terminating it.
  const cancel = () => {
    worker?.terminate();
    worker = null;
    pending?.resolve(null);
    pending = null;
  };

  const start = (): Worker => {
    const w = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (event: MessageEvent<WorkerReply>) => {
      if (!pending || event.data.id !== pending.id) return;
      const p = pending;
      pending = null;
      if ("error" in event.data) p.reject(new Error(event.data.error));
      else p.resolve(event.data.result);
    };
    w.onerror = (event) => {
      const p = pending;
      pending = null;
      w.terminate();
      if (worker === w) worker = null;
      p?.reject(new Error(event.message || "The solver stopped unexpectedly."));
    };
    return w;
  };

  return {
    solve(input) {
      cancel();
      const id = ++counter;
      const w = (worker = start());
      return new Promise((resolve, reject) => {
        pending = { id, resolve, reject };
        const request: WorkerRequest = { id, input };
        w.postMessage(request);
      });
    },
    dispose: cancel,
  };
}
