import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";
import { isNodeVersionSupported, MIN_NODE_VERSION } from "./nodeVersion.ts";

if (!isNodeVersionSupported(process.versions.node)) {
  console.error(`Node ${MIN_NODE_VERSION} or newer is required (found ${process.versions.node}).`);
  process.exit(1);
}

// Imported after the version check so older runtimes fail with the message above.
const { createApp } = await import("./api/app.ts");
const { SqliteProjectRepository } = await import("./database/projectRepository.ts");
const { SqliteFontRepository } = await import("./database/fontRepository.ts");

const repoRoot = resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT ?? 4310);
const configuredDb = process.env.SLOTH_DB_PATH;
// Default lives outside the checkout so every branch and worktree shares one database.
const dbPath = configuredDb
  ? isAbsolute(configuredDb) || configuredDb === ":memory:"
    ? configuredDb
    : resolve(repoRoot, configuredDb)
  : resolve(homedir(), "projects", "CodeMavens", "localdb", "crossword-generator.db");
const distDir = resolve(repoRoot, "dist");

const repository = new SqliteProjectRepository(dbPath);
const fonts = new SqliteFontRepository(dbPath);
const staticDir = existsSync(distDir) ? distDir : undefined;
const server = createServer(createApp({ repository, fonts, staticDir }));

server.listen(port, "127.0.0.1", () => {
  console.log(`Sloth & Llama server listening on http://127.0.0.1:${port} (db: ${dbPath})`);
});

function shutdown(): void {
  server.close(() => {
    repository.close();
    fonts.close();
    process.exit(0);
  });
  server.closeAllConnections();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
