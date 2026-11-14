import type { ProjectSummary } from "../../core/api.ts";

interface Props {
  projects: ProjectSummary[];
  activeId: string;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (project: ProjectSummary) => void;
}

export function ProjectList({ projects, activeId, onNew, onOpen, onDelete }: Props) {
  return (
    <section aria-labelledby="projects-heading">
      <div className="row between">
        <h2 id="projects-heading">Projects</h2>
        <button type="button" onClick={onNew}>New</button>
      </div>
      {projects.length === 0 && <p className="muted">No saved projects yet.</p>}
      <ul className="project-list">
        {projects.map((p) => (
          <li key={p.id} className={p.id === activeId ? "active" : undefined}>
            <div className="project-info">
              <strong>{p.projectName}</strong>
              {p.customerName && <span className="muted">{p.customerName}</span>}
              <span className="muted small">{new Date(p.updatedAt).toLocaleString()}</span>
            </div>
            <div className="row">
              <button type="button" onClick={() => onOpen(p.id)}>Open</button>
              <button type="button" className="danger" onClick={() => onDelete(p)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
