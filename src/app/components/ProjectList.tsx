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
    <div className="project-panel">
      <div className="row">
        <button type="button" className="primary grow" onClick={onNew}>New</button>
        <label className="file-button grow">
          <input
            id="projectImport"
            type="file"
            accept=".json,application/json"
            className="sr-only"
            disabled={busy}
            onChange={pick}
          />
          <span className="button-like" aria-disabled={busy || undefined}>Import project…</span>
        </label>
      </div>
      <div className="field">
        <label htmlFor="projectSearch" className="sr-only">Search projects</label>
        <input
          id="projectSearch"
          type="search"
          placeholder="Search projects"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {projects.length === 0 && <p className="muted">No saved projects yet.</p>}
      {projects.length > 0 && shown.length === 0 && <p className="muted">No projects match.</p>}
      <ul className="project-list">
        {shown.map((p) => {
          const active = p.id === activeId;
          return (
            <li key={p.id} className={active ? "active" : undefined} aria-current={active ? "true" : undefined}>
              <div className="project-info">
                <strong>{p.projectName}</strong>
                {p.customerName && <span className="muted">{p.customerName}</span>}
                <span className="muted small">{new Date(p.updatedAt).toLocaleString()}</span>
                {active && <span className="badge">Open now</span>}
              </div>
              <div className="row">
                <button type="button" className="small-button" onClick={() => onOpen(p.id)}>Open</button>
                <button type="button" className="small-button" disabled={busy} onClick={() => onDuplicate(p)}>Duplicate</button>
                <span className="grow" />
                <button type="button" className="danger quiet small-button" onClick={() => onDelete(p)}>Delete</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
