import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ProjectRecord, ProjectSummary } from "../../src/core/api.ts";
import type { NameArtProject } from "../../src/core/models/project.ts";

export interface ProjectRepository {
  list(): ProjectSummary[];
  get(id: string): ProjectRecord | null;
  create(project: NameArtProject): ProjectRecord;
  update(id: string, project: NameArtProject): ProjectRecord | null;
  delete(id: string): boolean;
  close(): void;
}

interface Row {
  id: string;
  project_name: string;
  customer_name: string | null;
  created_at: string;
  updated_at: string;
  schema_version: number;
  design_json: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  customer_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  design_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(project_name);
CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_name);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at);
`;

function toSummary(row: Row): ProjectSummary {
  return {
    id: row.id,
    projectName: row.project_name,
    customerName: row.customer_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRecord(row: Row): ProjectRecord {
  return {
    ...toSummary(row),
    schemaVersion: row.schema_version,
    project: JSON.parse(row.design_json) as NameArtProject,
  };
}

export class SqliteProjectRepository implements ProjectRepository {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }

  list(): ProjectSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, project_name, customer_name, created_at, updated_at, schema_version, design_json
         FROM projects ORDER BY updated_at DESC, rowid DESC`,
      )
      .all() as unknown as Row[];
    return rows.map(toSummary);
  }

  get(id: string): ProjectRecord | null {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as unknown as
      | Row
      | undefined;
    return row ? toRecord(row) : null;
  }

  create(project: NameArtProject): ProjectRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    const stored: NameArtProject = { ...project, id };
    this.db
      .prepare(
        `INSERT INTO projects (id, project_name, customer_name, created_at, updated_at, schema_version, design_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        stored.projectName,
        stored.customerName ?? null,
        now,
        now,
        stored.schemaVersion,
        JSON.stringify(stored),
      );
    return this.get(id) as ProjectRecord;
  }

  update(id: string, project: NameArtProject): ProjectRecord | null {
    const stored: NameArtProject = { ...project, id };
    const result = this.db
      .prepare(
        `UPDATE projects SET project_name = ?, customer_name = ?, updated_at = ?,
           schema_version = ?, design_json = ? WHERE id = ?`,
      )
      .run(
        stored.projectName,
        stored.customerName ?? null,
        new Date().toISOString(),
        stored.schemaVersion,
        JSON.stringify(stored),
        id,
      );
    return result.changes === 0 ? null : this.get(id);
  }

  delete(id: string): boolean {
    return this.db.prepare("DELETE FROM projects WHERE id = ?").run(id).changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
