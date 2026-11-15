import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { FrameGeometry } from "../../core/geometry/types.ts";
import { DEFAULT_SOLVER_WEIGHTS } from "../../core/models/defaults.ts";
import type { NameArtProject, NameEntry, SearchMode, SolverSettings, SolverWeights } from "../../core/models/project.ts";
import { checkFit, openingForSolver, WEIGHT_KEYS } from "../../core/solver/index.ts";
import type { FitResult, SolveResult, SolvedLayout, SolverOpening } from "../../core/solver/index.ts";
import { hasLayoutErrors, layoutIssuesFor } from "../../core/design/buildDesign.ts";
import { decideAutoGenerate, firstArrangement } from "../autoGenerate.ts";
import { layoutTiles } from "../crosswordTiles.ts";
import { createSolverClient } from "../solver/solverClient.ts";
import type { SolverClient } from "../solver/solverClient.ts";
import { NumberField } from "./FrameControls.tsx";

const WEIGHT_LABELS: Record<keyof SolverWeights, string> = {
  circularFit: "Circular fit",
  compactness: "Compactness",
  visualBalance: "Visual balance",
  naturalIntersections: "Natural intersections",
  fewConnectors: "Few connectors",
};
const MODES: [SearchMode, string][] = [
  ["quick", "Quick"],
  ["balanced", "Balanced"],
  ["thorough", "Thorough"],
];
const MAX_WEIGHT = 1000;
const MAX_SEED = 2147483647;

function weightProblem(raw: string): string | null {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n)) return "Enter a number.";
  return n < 0 || n > MAX_WEIGHT ? `Must be between 0 and ${MAX_WEIGHT}.` : null;
}

function seedProblem(raw: string): string | null {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isInteger(n)) return "Enter a whole number.";
  return n < 0 || n > MAX_SEED ? `Must be between 0 and ${MAX_SEED}.` : null;
}

function freshSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! % (MAX_SEED + 1);
}

function Thumbnail({ solved, names }: { solved: SolvedLayout; names: NameEntry[] }) {
  const tiles = layoutTiles(solved.layout, names);
  const decos = solved.layout.decorativeTiles.map((d) => d.position);
  // Bounds from the drawn cells, so a connector past the letters is never clipped.
  const cells = [...tiles, ...decos];
  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  const width = Math.max(...cells.map((c) => c.x)) - minX + 1;
  const height = Math.max(...cells.map((c) => c.y)) - minY + 1;
  return (
    <svg
      className="candidate-thumb"
      viewBox={`${minX - 0.1} ${minY - 0.1} ${width + 0.2} ${height + 0.2}`}
      aria-hidden="true"
    >
      {tiles.map((t) => (
        <rect key={`${t.x},${t.y}`} x={t.x} y={t.y} width={0.92} height={0.92} fill="#c99a5b" />
      ))}
      {decos.map((d) => (
        <rect key={`d${d.x},${d.y}`} x={d.x} y={d.y} width={0.92} height={0.92} fill="#c4574f" />
      ))}
    </svg>
  );
}

interface Generated {
  result: SolveResult;
  names: NameEntry[];
  namesKey: string;
  opening: SolverOpening;
}

function sameOpening(a: SolverOpening, b: SolverOpening): boolean {
  if (a === b) return true;
  if (a.tileSizeMm !== b.tileSizeMm || a.clearance !== b.clearance || a.polygon.length !== b.polygon.length) return false;
  if (a.centroid.x !== b.centroid.x || a.centroid.y !== b.centroid.y) return false;
  return a.polygon.every((p, i) => p.x === b.polygon[i]!.x && p.y === b.polygon[i]!.y);
}

interface Props {
  project: NameArtProject;
  geometry: FrameGeometry | null;
  hasErrors: boolean;
  onSolverChange: (solver: SolverSettings) => void;
  onSelect: (solved: SolvedLayout) => void;
  // Why there is no frame to generate in (AC8a); shown beside Generate.
  frameProblem?: ReactNode;
  // Where the chosen arrangement sits in the generated list, for the step rail.
  onRankChange?: (rank: { index: number; count: number } | null) => void;
  // Relays the outcome of a run to the app-level live region (the panel may be hidden by then).
  announce?: (message: string) => void;
  // Whether a run is in progress and why the latest one for these names failed, for the preview.
  onRunState?: (state: { busy: boolean; problem: string }) => void;
}

export function SolverPanel({ project, geometry, hasErrors, onSolverChange, onSelect, frameProblem, onRankChange, announce, onRunState }: Props) {
  const solver = project.settings.solver;
  const clientRef = useRef<SolverClient | null>(null);
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [runError, setRunError] = useState("");

  useEffect(() => {
    const client = createSolverClient();
    clientRef.current = client;
    return () => {
      client.dispose();
      clientRef.current = null;
    };
  }, []);

  const namesKey = JSON.stringify(project.names);
  const tileSizeMm = project.settings.tileSizeMm;
  const clearanceMm = project.settings.frame.crosswordClearanceMm;
  const opening = useMemo(
    () => (geometry ? openingForSolver(geometry.usableOpening, tileSizeMm, clearanceMm) : null),
    [geometry, tileSizeMm, clearanceMm],
  );
  const ready = !hasErrors && geometry !== null && project.names.length > 0;
  const canGenerate = !busy && ready;
  const namesKeyRef = useRef(namesKey);
  namesKeyRef.current = namesKey;
  const openedKey = useRef(namesKey).current;
  const lastRunKey = useRef<string | null>(null);

  const generate = async (auto = false) => {
    const client = clientRef.current;
    if (!client || !opening) return;
    const names = project.names;
    const runKey = JSON.stringify(names);
    lastRunKey.current = runKey;
    setBusy(true);
    setRunError("");
    try {
      const result = await client.solve({ names, settings: solver, opening });
      if (result === null) return; // superseded or unmounted
      // Stored with its inputs; staleness against the settings at render time is handled below.
      setGenerated({ result, names, namesKey: runKey, opening });
      setBusy(false);
      // Names edited into something else mid-run: keep the list but do not select from it.
      const stillCurrent = namesKeyRef.current === runKey;
      const first = auto && stillCurrent ? firstArrangement(result) : null;
      if (first) selectRef.current(first);
      if (auto && !stillCurrent) return;
      const count = result.layouts.length;
      announce?.(result.failure ? result.failure.message : `Generated ${count} ${count === 1 ? "arrangement" : "arrangements"}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRunError(message);
      setBusy(false);
      announce?.(message);
    }
  };

  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const generateRef = useRef(generate);
  generateRef.current = generate;
  const layoutState = !project.selectedLayout
    ? "none"
    : hasLayoutErrors(layoutIssuesFor(project.names, project.selectedLayout))
      ? "stale"
      : "matches";
  // Names and readiness drive automatic generation; frame, size and solver settings deliberately do not.
  useEffect(() => {
    const decision = decideAutoGenerate({ canGenerate: ready, namesKey, openedKey, lastRunKey: lastRunKey.current, layout: layoutState });
    if (!decision.run) return;
    const timer = window.setTimeout(() => void generateRef.current(true), decision.delayMs);
    return () => window.clearTimeout(timer);
  }, [ready, namesKey, openedKey, layoutState]);

  const setWeight = (key: keyof SolverWeights, value: number) =>
    onSolverChange({ ...solver, weights: { ...solver.weights, [key]: value } });

  const current = generated && generated.namesKey === namesKey ? generated : null;
  const openingChanged = current !== null && (opening === null || !sameOpening(current.opening, opening));
  const selectedLayout = project.selectedLayout;
  // Fit is always shown against the current opening, so frame or tile size edits never leave a stale label.
  const liveFits = useMemo(() => {
    const fits = new Map<string, FitResult>();
    if (!current || !opening) return fits;
    for (const solved of current.result.layouts) {
      // The selected card follows the saved layout, which may carry manual end tiles.
      const layout = selectedLayout && selectedLayout.id === solved.layout.id ? selectedLayout : solved.layout;
      fits.set(solved.layout.id, checkFit(layout, current.names, opening));
    }
    return fits;
  }, [current, opening, selectedLayout]);
  const problem = runError || (current?.result.failure?.message ?? "");
  const runReport = useRef(onRunState);
  runReport.current = onRunState;
  useEffect(() => {
    runReport.current?.({ busy, problem });
  }, [busy, problem]);
  useEffect(() => () => runReport.current?.({ busy: false, problem: "" }), []);
  const [resetCount, setResetCount] = useState(0);
  const selectedId = project.selectedLayout?.id;
  const rankIndex = current && !current.result.failure ? current.result.layouts.findIndex((l) => l.layout.id === selectedId) : -1;
  const rankCount = current?.result.layouts.length ?? 0;
  const rankReport = useRef(onRankChange);
  rankReport.current = onRankChange;
  useEffect(() => {
    rankReport.current?.(rankIndex >= 0 ? { index: rankIndex, count: rankCount } : null);
  }, [rankIndex, rankCount]);
  useEffect(() => () => rankReport.current?.(null), []);

  return (
    <div className="solver-panel">
      <div className="field-grid two">
        <div className="field">
          <label htmlFor="solver-mode">Search mode</label>
          <select
            id="solver-mode"
            value={solver.searchMode}
            onChange={(e) => onSolverChange({ ...solver, searchMode: e.target.value as SearchMode })}
          >
            {MODES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="seed-row">
          <NumberField
            id="solver-seed"
            label="Seed"
            value={solver.seed}
            check={seedProblem}
            onValid={(n) => onSolverChange({ ...solver, seed: n })}
          />
          <button type="button" onClick={() => onSolverChange({ ...solver, seed: freshSeed() })}>
            New seed
          </button>
        </div>
      </div>
      <div className="generate-row">
        <button type="button" className="primary large" disabled={!canGenerate} onClick={() => void generate()}>
          {busy ? "Generating..." : "Generate"}
        </button>
        {hasErrors && <span className="muted small">Fix the names first.</span>}
        {!hasErrors && project.names.length === 0 && <span className="muted small">Add names first.</span>}
        {frameProblem}
      </div>
      <details className="disclosure">
        <summary>Scoring weights</summary>
        <div className="field-grid three">
          {WEIGHT_KEYS.map((key) => (
            <NumberField
              key={`${key}-${resetCount}`}
              id={`solver-${key}`}
              label={WEIGHT_LABELS[key]}
              value={solver.weights[key]}
              check={weightProblem}
              onValid={(n) => setWeight(key, n)}
            />
          ))}
          <div className="field reset-cell">
            <button
              type="button"
              onClick={() => {
                // Remount the fields so a blank or refused draft does not outlive the reset.
                setResetCount((n) => n + 1);
                onSolverChange({ ...solver, weights: { ...DEFAULT_SOLVER_WEIGHTS } });
              }}
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </details>
      <p className="muted small">
        Weight, mode and seed changes apply the next time you generate. The crossword shown does not change.
      </p>
      {runError && (
        <p className="banner error" role="alert">
          {runError}
        </p>
      )}
      {generated && !current && (
        <p className="muted">The names changed since these arrangements were generated. They update once the names are valid.</p>
      )}
      {current?.result.failure && (
        <div className="banner error" role="alert">
          <p>{current.result.failure.message}</p>
          {current.result.nameProblems.length > 0 && (
            <ul>
              {current.result.nameProblems.map((p) => (
                <li key={p.nameId}>
                  {current.names.find((n) => n.id === p.nameId)?.text ?? p.nameId}: {p.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {current && !current.result.failure && openingChanged && (
        <p className="muted small" role="status">
          Frame or tile size changed since these were generated; fit is rechecked, scores are from generation.
          Generate again to re-rank.
        </p>
      )}
      {current && !current.result.failure && (
        <>
          <h3 className="group-title">Arrangements</h3>
          <ul className="candidates" aria-label="Generated arrangements">
            {current.result.layouts.map((solved, i) => {
              const selected = solved.layout.id === selectedId;
              const b = solved.score.breakdown;
              const fit = liveFits.get(solved.layout.id) ?? null;
              return (
                <li key={solved.layout.id} className={selected ? "candidate selected" : "candidate"}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Use arrangement ${i + 1}`}
                    onClick={() => onSelect(solved)}
                  >
                    <Thumbnail solved={solved} names={current.names} />
                    <span className="candidate-info">
                      <span className="candidate-title">
                        <strong>
                          #{i + 1} score {solved.score.total.toFixed(3)}
                        </strong>
                        {selected && <span className="badge">Selected</span>}
                      </span>
                      <span className="small">
                        {solved.intersectionCount} {solved.intersectionCount === 1 ? "intersection" : "intersections"} ·{" "}
                        {solved.connectorCount} {solved.connectorCount === 1 ? "connector" : "connectors"} ·{" "}
                        {fit === null ? "fit unknown" : fit.fits ? "fits" : "does not fit"}
                      </span>
                      <span className="small muted">
                        {WEIGHT_KEYS.map((k) => `${WEIGHT_LABELS[k].split(" ")[0]} ${b[k].toFixed(2)}`).join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
