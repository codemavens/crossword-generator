import assert from "node:assert/strict";
import { solve, validateLayout } from "../../../src/core/solver/index.ts";
import type { SolveInput, SolveResult, SolverOpening } from "../../../src/core/solver/index.ts";
import { DEFAULT_SOLVER_WEIGHTS } from "../../../src/core/models/defaults.ts";
import type { NameEntry, SearchMode, SolverWeights } from "../../../src/core/models/project.ts";

export const TEN_NAMES = ["SANDERS", "ANNA", "ELLA", "SAM", "SUE", "MICHAEL", "OLIVIA", "NOAH", "EMMA", "LIAM"];

export function entries(texts: string[]): NameEntry[] {
  return texts.map((text, i) => ({ id: `n${i}`, text }));
}

export function circleOpening(radius: number, clearance = 0, tileSizeMm = 12.7, points = 720): SolverOpening {
  const polygon = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * 2 * Math.PI;
    return { x: radius * Math.cos(a), y: radius * Math.sin(a) };
  });
  return { polygon, centroid: { x: 0, y: 0 }, clearance, tileSizeMm };
}

export function run(
  texts: string[] | NameEntry[],
  options: { seed?: number; mode?: SearchMode; weights?: SolverWeights; opening?: SolverOpening } = {},
): { names: NameEntry[]; result: SolveResult } {
  const names = typeof texts[0] === "string" ? entries(texts as string[]) : (texts as NameEntry[]);
  const input: SolveInput = {
    names,
    settings: {
      seed: options.seed ?? 1,
      searchMode: options.mode ?? "quick",
      weights: options.weights ?? { ...DEFAULT_SOLVER_WEIGHTS },
    },
  };
  if (options.opening) input.opening = options.opening;
  const result = solve(input);
  assertAllValid(names, result);
  return { names, result };
}

// Every returned layout must pass the independent validator and place every name exactly once.
export function assertAllValid(names: NameEntry[], result: SolveResult): void {
  for (const solved of result.layouts) {
    const errors = validateLayout(names, solved.layout).filter((i) => i.severity === "error");
    assert.deepEqual(errors, [], `layout ${solved.layout.id} has errors`);
    const ids = solved.layout.placements.map((p) => p.nameId).sort();
    assert.deepEqual(ids, names.map((n) => n.id).sort());
    assert.ok(solved.issues.every((i) => i.severity === "warning"));
  }
}
