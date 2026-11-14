import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

const children: ChildProcess[] = [
  spawn("node", ["--watch", "server/main.ts"], { stdio: "inherit" }),
  spawn("node", ["node_modules/vite/bin/vite.js"], { stdio: "inherit" }),
];

let stopping = false;
function stopAll(code: number): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500).unref();
}

for (const child of children) child.on("exit", (code) => stopAll(code ?? 0));
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
