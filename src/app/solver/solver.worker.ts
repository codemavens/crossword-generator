import { solve } from "../../core/solver/index.ts";
import type { SolveInput, SolveResult } from "../../core/solver/index.ts";

export interface WorkerRequest {
  id: number;
  input: SolveInput;
}
export type WorkerReply = { id: number; result: SolveResult } | { id: number; error: string };

// Minimal worker-scope typing so the app tsconfig does not need the WebWorker lib.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerReply): void;
};

scope.onmessage = (event) => {
  const { id, input } = event.data;
  try {
    scope.postMessage({ id, result: solve(input) });
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
