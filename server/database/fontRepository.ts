import { DatabaseSync } from "node:sqlite";
import type { StatementSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { FontFormat, FontSummary } from "../../src/core/api.ts";

export interface StoredFont {
  summary: FontSummary;
  bytes: Uint8Array;
}

export interface FontRepository {
  list(): FontSummary[];
  get(id: string): StoredFont | null;
  add(summary: FontSummary, bytes: Uint8Array): "added" | "exists";
  remove(id: string): boolean;
  count(): number;
  close(): void;
}

interface SummaryRow {
  id: string;
  name: string;
  format: string;
  size_bytes: number;
  added_at: string;
}

interface FullRow extends SummaryRow {
  bytes: Uint8Array;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fonts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  bytes BLOB NOT NULL,
  added_at TEXT NOT NULL
);
`;

function toSummary(row: SummaryRow): FontSummary {
  return {
    id: row.id,
    name: row.name,
    format: row.format as FontFormat,
    sizeBytes: row.size_bytes,
    addedAt: row.added_at,
  };
}

// Uses its own connection to the same database file as the project repository.
export class SqliteFontRepository implements FontRepository {
  private readonly db: DatabaseSync;
  private readonly statements: {
    list: StatementSync;
    get: StatementSync;
    add: StatementSync;
    remove: StatementSync;
    count: StatementSync;
  };

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
    this.statements = {
      list: this.db.prepare(
        `SELECT id, name, format, size_bytes, added_at FROM fonts
         ORDER BY name COLLATE NOCASE, id`,
      ),
      get: this.db.prepare("SELECT id, name, format, size_bytes, added_at, bytes FROM fonts WHERE id = ?"),
      add: this.db.prepare(
        `INSERT OR IGNORE INTO fonts (id, name, format, size_bytes, bytes, added_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ),
      remove: this.db.prepare("DELETE FROM fonts WHERE id = ?"),
      count: this.db.prepare("SELECT COUNT(*) AS n FROM fonts"),
    };
  }

  list(): FontSummary[] {
    return (this.statements.list.all() as unknown as SummaryRow[]).map(toSummary);
  }

  get(id: string): StoredFont | null {
    const row = this.statements.get.get(id) as unknown as FullRow | undefined;
    return row ? { summary: toSummary(row), bytes: new Uint8Array(row.bytes) } : null;
  }

  add(summary: FontSummary, bytes: Uint8Array): "added" | "exists" {
    const result = this.statements.add.run(
      summary.id,
      summary.name,
      summary.format,
      summary.sizeBytes,
      bytes,
      summary.addedAt,
    );
    return result.changes > 0 ? "added" : "exists";
  }

  remove(id: string): boolean {
    return this.statements.remove.run(id).changes > 0;
  }

  count(): number {
    return Number((this.statements.count.get() as { n: number | bigint }).n);
  }

  close(): void {
    this.db.close();
  }
}
