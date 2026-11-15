import { useState } from "react";
import type { ChangeEvent } from "react";
import type { ProjectSummary } from "../../core/api.ts";
import { filterProjects } from "../../core/models/projectFilter.ts";

interface Props {
  projects: ProjectSummary[];
  activeId: string;
  busy: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDuplicate: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
  onImport: (file: File) => void;
}

export function ProjectList({ projects, activeId, busy, onNew, onOpen, onDuplicate, onDelete, onImport }: Props) {
  const [query, setQuery] = useState("");
  const shown = filterProjects(projects, query);
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so choosing the same file again still fires onChange.
    e.target.value = "";
    if (file) onImport(file);
  };
  return (
    <section aria-labelledby="projects-heading">
      <div className="row between">
        <h2 id="projects-heading">Projects</h2>
        <button type="button" onClick={onNew}>New</button>
      </div>
      <div className="field">
        <label htmlFor="projectSearch">Search projects</label>
        <input id="projectSearch" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="projectImport">Import project…</label>
        <input id="projectImport" type="file" accept=".json,application/json" disabled={busy} onChange={pick} />
      </div>
      {projects.length === 0 && <p className="muted">No saved projects yet.</p>}
      {projects.length > 0 && shown.length === 0 && <p className="muted">No projects match.</p>}
      <ul className="project-list">
        {shown.map((p) => (
          <li key={p.id} className={p.id === activeId ? "active" : undefined}>
            <div className="project-info">
              <strong>{p.projectName}</strong>
              {p.customerName && <span className="muted">{p.customerName}</span>}
              <span className="muted small">{new Date(p.updatedAt).toLocaleString()}</span>
            </div>
            <div className="row">
              <button type="button" onClick={() => onOpen(p.id)}>Open</button>
              <button type="button" disabled={busy} onClick={() => onDuplicate(p)}>Duplicate</button>
              <button type="button" className="danger" onClick={() => onDelete(p)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
