import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectSummary } from "../core/api.ts";
import { newProject, withCurrentDefaults } from "../core/models/defaults.ts";
import type { FontOutliner } from "../core/geometry/types.ts";
import { buildFrameGeometry } from "../core/geometry/frame.ts";
import type { NameArtProject } from "../core/models/project.ts";
import { MAX_TILE_SIZE_MM, validateNameText } from "../core/models/validation.ts";
import { checkFit, gridOriginMm, openingForSolver, validateLayout } from "../core/solver/index.ts";
import { ApiRequestError, api } from "./api/client.ts";
import { DEFAULT_NAME_FONT_ID, DEFAULT_YEAR_FONT_ID, knownFontId, loadFont } from "./fonts.ts";
import { layoutTiles } from "./crosswordTiles.ts";
import { FrameControls, NumberField } from "./components/FrameControls.tsx";
import { FramePreview } from "./components/FramePreview.tsx";
import type { CrosswordOverlay } from "./components/FramePreview.tsx";
import { ProjectEditor } from "./components/ProjectEditor.tsx";
import { ProjectList } from "./components/ProjectList.tsx";
import { SolverPanel } from "./components/SolverPanel.tsx";

function tileSizeProblem(raw: string): string | null {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n)) return "Enter a number.";
  return n <= 0 || n > MAX_TILE_SIZE_MM ? `Must be above 0 and at most ${MAX_TILE_SIZE_MM}.` : null;
}

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
  // Changes when a different project is shown, so per-project session state (candidates) resets.
  const [session, setSession] = useState(0);

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
      const loaded = withCurrentDefaults((await api.getProject(id)).project);
      setProject(loaded);
      setSession((n) => n + 1);
    } catch (err) {
      setErrors(describe(err));
    }
  };

  const startNew = () => {
    setErrors([]);
    setStatus("");
    setProject(newProject());
    setSession((n) => n + 1);
  };

  const remove = async (p: ProjectSummary) => {
    if (!window.confirm(`Delete project "${p.projectName}"? This cannot be undone.`)) return;
    setErrors([]);
    try {
      await api.deleteProject(p.id);
      if (project.id === p.id) {
        setProject(newProject());
        setSession((n) => n + 1);
      }
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

  const tileSizeMm = project.settings.tileSizeMm;
  const geometry = frameResult.geometry;
  const layout = project.selectedLayout;

  const crossword = useMemo(() => {
    if (!layout) return { overlay: null, state: "none" as const, outsideCount: 0 };
    if (validateLayout(project.names, layout).some((i) => i.severity === "error")) {
      return { overlay: null, state: "stale" as const, outsideCount: 0 };
    }
    if (!geometry) return { overlay: null, state: "pending" as const, outsideCount: 0 };
    const opening = openingForSolver(geometry.usableOpening, tileSizeMm, frame.crosswordClearanceMm);
    const fit = checkFit(layout, project.names, opening);
    const overlay: CrosswordOverlay = {
      tiles: layoutTiles(layout, project.names),
      originMm: gridOriginMm(layout, project.names, geometry.usableOpening.centroid, tileSizeMm),
      tileSizeMm,
      outside: new Set(fit.tilesOutside.map((t) => `${t.x},${t.y}`)),
    };
    return { overlay, state: "shown" as const, outsideCount: fit.tilesOutside.length };
  }, [layout, project.names, geometry, tileSizeMm, frame.crosswordClearanceMm]);

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
            <div className="field narrow">
              <NumberField
                id="tileSize"
                label="Tile size (mm)"
                value={tileSizeMm}
                check={tileSizeProblem}
                onValid={(n) => setProject((p) => ({ ...p, settings: { ...p.settings, tileSizeMm: n } }))}
              />
            </div>
            <FramePreview geometry={geometry} crossword={crossword.overlay} />
            <div className="crossword-status">
              {crossword.state === "none" && <p className="muted">Generate to see arrangements.</p>}
              {crossword.state === "stale" && (
                <p className="banner warn" role="status">
                  The names changed, so the saved crossword no longer matches. Generate again and pick an arrangement.
                </p>
              )}
              {crossword.state === "shown" && crossword.outsideCount > 0 && (
                <p className="banner warn" role="alert">
                  The crossword does not fit inside the frame: {crossword.outsideCount}{" "}
                  {crossword.outsideCount === 1 ? "tile is" : "tiles are"} outside the allowed area. Increase the
                  frame diameter, reduce the tile size, or generate again.
                </p>
              )}
            </div>
            <SolverPanel
              key={session}
              project={project}
              geometry={geometry}
              hasErrors={hasErrors}
              onSolverChange={(solver) =>
                setProject((p) => ({ ...p, settings: { ...p.settings, solver } }))
              }
              onSelect={(solved) => setProject((p) => ({ ...p, selectedLayout: solved.layout }))}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
