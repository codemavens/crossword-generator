import { useEffect, useMemo, useRef, useState } from "react";
import type { FrameGeometry } from "../../core/geometry/types.ts";
import { DEFAULT_SOLVER_WEIGHTS } from "../../core/models/defaults.ts";
import type { NameArtProject, NameEntry, SearchMode, SolverSettings, SolverWeights } from "../../core/models/project.ts";
import { checkFit, openingForSolver, WEIGHT_KEYS } from "../../core/solver/index.ts";
import type { FitResult, SolveResult, SolvedLayout, SolverOpening } from "../../core/solver/index.ts";
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
  const { bounds } = solved;
  const tiles = layoutTiles(solved.layout, names);
  return (
    <svg
      className="candidate-thumb"
      viewBox={`${bounds.minX - 0.1} ${bounds.minY - 0.1} ${bounds.width + 0.2} ${bounds.height + 0.2}`}
      aria-hidden="true"
    >
      {tiles.map((t) => (
        <rect key={`${t.x},${t.y}`} x={t.x} y={t.y} width={0.92} height={0.92} fill="#c99a5b" />
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
}

export function SolverPanel({ project, geometry, hasErrors, onSolverChange, onSelect }: Props) {
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
  const canGenerate = !busy && !hasErrors && geometry !== null && project.names.length > 0;

  const generate = async () => {
    const client = clientRef.current;
    if (!client || !opening) return;
    const names = project.names;
    setBusy(true);
    setRunError("");
    try {
      const result = await client.solve({ names, settings: solver, opening });
      if (result === null) return; // superseded or unmounted
      // Stored with its inputs; staleness against the settings at render time is handled below.
      setGenerated({ result, names, namesKey: JSON.stringify(names), opening });
      setBusy(false);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const setWeight = (key: keyof SolverWeights, value: number) =>
    onSolverChange({ ...solver, weights: { ...solver.weights, [key]: value } });

  const current = generated && generated.namesKey === namesKey ? generated : null;
  const openingChanged = current !== null && (opening === null || !sameOpening(current.opening, opening));
  // Fit is always shown against the current opening, so frame or tile size edits never leave a stale label.
  const liveFits = useMemo(() => {
    const fits = new Map<string, FitResult>();
    if (!current || !opening) return fits;
    for (const solved of current.result.layouts) fits.set(solved.layout.id, checkFit(solved.layout, current.names, opening));
    return fits;
  }, [current, opening]);
  const selectedId = project.selectedLayout?.id;

  return (
    <div className="solver-panel">
      <h3>Arrangement</h3>
      <div className="field-grid">
        {WEIGHT_KEYS.map((key) => (
          <NumberField
            key={key}
            id={`solver-${key}`}
            label={`${WEIGHT_LABELS[key]} weight`}
            value={solver.weights[key]}
            check={weightProblem}
            onValid={(n) => setWeight(key, n)}
          />
        ))}
      </div>
      <div className="row solver-row">
        <button type="button" onClick={() => onSolverChange({ ...solver, weights: { ...DEFAULT_SOLVER_WEIGHTS } })}>
          Reset to defaults
        </button>
        <div className="field narrow">
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
      <p className="muted small">
        Weight, mode and seed changes apply the next time you generate. The crossword shown does not change.
      </p>
      <div className="row">
        <button type="button" className="primary" disabled={!canGenerate} onClick={() => void generate()}>
          {busy ? "Generating..." : "Generate"}
        </button>
        {hasErrors && <span className="muted small">Fix the names first.</span>}
        {!hasErrors && project.names.length === 0 && <span className="muted small">Add names first.</span>}
      </div>
      {runError && (
        <p className="banner error" role="alert">
          {runError}
        </p>
      )}
      {generated && !current && (
        <p className="muted">The names changed since these arrangements were generated. Generate again.</p>
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
                    <strong>
                      #{i + 1} score {solved.score.total.toFixed(3)}
                    </strong>
                    <span className="small">
                      {WEIGHT_KEYS.map((k) => `${WEIGHT_LABELS[k].split(" ")[0]} ${b[k].toFixed(2)}`).join(" · ")}
                    </span>
                    <span className="small">
                      {solved.intersectionCount} intersections ·{" "}
                      {fit === null ? "fit unknown" : fit.fits ? "fits" : "does not fit"}
                      {selected ? " · selected" : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
