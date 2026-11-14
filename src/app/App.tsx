import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectSummary } from "../core/api.ts";
import { newProject, withCurrentDefaults } from "../core/models/defaults.ts";
import type { FontOutliner } from "../core/geometry/types.ts";
import { buildFrameGeometry } from "../core/geometry/frame.ts";
import type { NameArtProject } from "../core/models/project.ts";
import { MAX_TILE_SIZE_MM, validateNameText } from "../core/models/validation.ts";
import { SAMPLE_LAYOUT, SAMPLE_NAMES, occupiedTiles } from "../core/preview/sampleLayout.ts";
import { ApiRequestError, api } from "./api/client.ts";
import { DEFAULT_NAME_FONT_ID, DEFAULT_YEAR_FONT_ID, knownFontId, loadFont } from "./fonts.ts";
import { CrosswordPreview } from "./components/CrosswordPreview.tsx";
import { FrameControls } from "./components/FrameControls.tsx";
import { FramePreview } from "./components/FramePreview.tsx";
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
      setProject(withCurrentDefaults((await api.getProject(id)).project));
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
    const submitted = project;
    try {
      const record =
        submitted.id === ""
          ? await api.createProject(submitted)
          : await api.updateProject(submitted.id, submitted);
      // Keep edits made while the save was in flight; only adopt the new id.
      setProject((current) => {
        if (current === submitted) return record.project;
        return current.id === submitted.id ? { ...current, id: record.project.id } : current;
      });
      setStatus("Saved.");
      await refresh();
    } catch (err) {
      setErrors(describe(err));
    } finally {
      setSaving(false);
    }
  };

  const frame = project.settings.frame;
  const nameFontId = knownFontId(frame.familyNameFontId, DEFAULT_NAME_FONT_ID);
  const yearFontId = knownFontId(frame.yearFontId, DEFAULT_YEAR_FONT_ID);
  const [fonts, setFonts] = useState<{ name: FontOutliner; year: FontOutliner } | null>(null);
  const [fontError, setFontError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setFontError("");
    Promise.all([loadFont(nameFontId), loadFont(yearFontId)])
      .then(([name, year]) => {
        if (!cancelled) setFonts({ name, year });
      })
      .catch((err: unknown) => {
        if (!cancelled) setFontError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [nameFontId, yearFontId]);

  const frameResult = useMemo(() => {
    if (!fonts) return { geometry: null, error: "" };
    try {
      const geometry = buildFrameGeometry({
        familyName: project.familyName,
        year: project.year,
        settings: frame,
        nameFont: fonts.name,
        yearFont: fonts.year,
      });
      return { geometry, error: "" };
    } catch (err) {
      return { geometry: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [fonts, project.familyName, project.year, frame]);

  const setTileSize = (value: string) => {
    const mm = Number(value);
    if (!Number.isFinite(mm) || mm <= 0 || mm > MAX_TILE_SIZE_MM) return;
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
          <section className="preview frame-section" aria-labelledby="frame-heading">
            <h2 id="frame-heading">Frame preview</h2>
            <FrameControls
              frame={frame}
              onChange={(next) =>
                setProject({ ...project, settings: { ...project.settings, frame: next } })
              }
            />
            {!fonts && !fontError && <p className="muted">Loading fonts…</p>}
            {fontError && (
              <p className="banner error" role="alert">
                {fontError}
              </p>
            )}
            {frameResult.error && (
              <p className="banner error" role="alert">
                Could not build the frame: {frameResult.error}
              </p>
            )}
            {frameResult.geometry && frameResult.geometry.warnings.length > 0 && (
              <ul className="banner warn">
                {frameResult.geometry.warnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            )}
            <FramePreview geometry={frameResult.geometry} />
          </section>
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
