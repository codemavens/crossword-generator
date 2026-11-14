import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectSummary } from "../core/api.ts";
import { newProject } from "../core/models/defaults.ts";
import type { NameArtProject } from "../core/models/project.ts";
import { validateNameText } from "../core/models/validation.ts";
import { SAMPLE_LAYOUT, SAMPLE_NAMES, occupiedTiles } from "../core/preview/sampleLayout.ts";
import { ApiRequestError, api } from "./api/client.ts";
import { CrosswordPreview } from "./components/CrosswordPreview.tsx";
import { ProjectEditor } from "./components/ProjectEditor.tsx";
import { ProjectList } from "./components/ProjectList.tsx";

const sampleTiles = occupiedTiles(SAMPLE_NAMES, SAMPLE_LAYOUT);

function describe(err: unknown): string[] {
  if (err instanceof ApiRequestError) {
    return [err.message, ...err.issues.map((i) => `${i.field}: ${i.message}`)];
  }
  return [err instanceof Error ? err.message : String(err)];
}

export function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<NameArtProject>(newProject);
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
    } catch (err) {
      setErrors(describe(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasErrors = useMemo(
    () => project.names.some((n) => validateNameText(n.text) !== null),
    [project.names],
  );

  const open = async (id: string) => {
    setErrors([]);
    setStatus("");
    try {
      setProject((await api.getProject(id)).project);
    } catch (err) {
      setErrors(describe(err));
    }
  };

  const startNew = () => {
    setErrors([]);
    setStatus("");
    setProject(newProject());
  };

  const remove = async (p: ProjectSummary) => {
    if (!window.confirm(`Delete project "${p.projectName}"? This cannot be undone.`)) return;
    setErrors([]);
    try {
      await api.deleteProject(p.id);
      if (project.id === p.id) setProject(newProject());
      await refresh();
    } catch (err) {
      setErrors(describe(err));
    }
  };

  const save = async () => {
    setSaving(true);
    setErrors([]);
    setStatus("");
    try {
      const record =
        project.id === ""
          ? await api.createProject(project)
          : await api.updateProject(project.id, project);
      setProject(record.project);
      setStatus("Saved.");
      await refresh();
    } catch (err) {
      setErrors(describe(err));
    } finally {
      setSaving(false);
    }
  };

  const setTileSize = (value: string) => {
    const mm = Number(value);
    if (!Number.isFinite(mm) || mm <= 0) return;
    setProject({ ...project, settings: { ...project.settings, tileSizeMm: mm } });
  };

  return (
    <div className="app">
      <header>
        <h1>Sloth &amp; Llama Name Art Designer</h1>
      </header>
      <div className="columns">
        <aside>
          <ProjectList
            projects={projects}
            activeId={project.id}
            onNew={startNew}
            onOpen={(id) => void open(id)}
            onDelete={(p) => void remove(p)}
          />
        </aside>
        <main>
          <h2>{project.id === "" ? "New project" : "Edit project"}</h2>
          {errors.length > 0 && (
            <div className="banner error" role="alert">
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {status && <p className="banner ok" role="status">{status}</p>}
          <ProjectEditor
            project={project}
            hasErrors={hasErrors}
            saving={saving}
            onChange={setProject}
            onSave={() => void save()}
          />
          <section className="preview" aria-labelledby="preview-heading">
            <h2 id="preview-heading">Tile preview</h2>
            <p className="muted">
              Sample arrangement only. It is not generated from the names entered above.
            </p>
            <div className="field narrow">
              <label htmlFor="tileSize">Tile size (mm)</label>
              <input
                id="tileSize"
                type="number"
                min="1"
                step="0.1"
                value={project.settings.tileSizeMm}
                onChange={(e) => setTileSize(e.target.value)}
              />
            </div>
            <div className="preview-scroll">
              <CrosswordPreview tiles={sampleTiles} tileSizeMm={project.settings.tileSizeMm} />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
