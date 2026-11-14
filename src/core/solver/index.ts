// Public solver API (docs/SPEC.md §6–§9). Pure and deterministic: same input and seed, same result.
import type { CrosswordLayout, NamePlacement } from "../models/project.ts";
import { MAX_NAMES } from "../models/validation.ts";
import { createFitChecker, fitCells, type FitChecker } from "./fit.ts";
import { cellsBounds, layoutCells, type GridCell } from "./grid.ts";
import { normalizeNames, type NormalizedName } from "./normalize.ts";
import { hashString } from "./rng.ts";
import { combineScore, compareRankable, computeMetrics, sanitizeWeights, weightSum } from "./score.ts";
import { searchLayouts, type Place } from "./search.ts";
import type { LayoutIssue, SolvedLayout, SolveFailure, SolveInput, SolveResult } from "./types.ts";
import { validateLayout } from "./validate.ts";

export type * from "./types.ts";
export { validateLayout } from "./validate.ts";
export { checkFit, gridOrigin, gridOriginMm, openingForSolver } from "./fit.ts";
export { combineScore, sanitizeWeights, WEIGHT_KEYS } from "./score.ts";
export { SEARCH_BUDGETS } from "./search.ts";

export const MAX_CANDIDATES = 8;
// Bounds the scoring work when the search finds very many arrangements.
const MAX_POOL = 2000;

// Groups of names linked by sharing at least one character, as name ids in input order.
export function sharedLetterGroups(names: readonly NormalizedName[]): string[][] {
  const parent = names.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const sets = names.map((n) => new Set(n.chars));
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if ([...sets[i]!].some((ch) => sets[j]!.has(ch))) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, string[]>();
  names.forEach((n, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), n.id]));
  return [...groups.values()];
}

// Same picture under translation, rotation or mirroring gives the same string.
export function canonicalForm(cells: readonly GridCell[]): string {
  const transforms: ((x: number, y: number) => [number, number])[] = [
    (x, y) => [x, y],
    (x, y) => [-x, y],
    (x, y) => [x, -y],
    (x, y) => [-x, -y],
    (x, y) => [y, x],
    (x, y) => [-y, x],
    (x, y) => [y, -x],
    (x, y) => [-y, -x],
  ];
  let best: string | null = null;
  for (const t of transforms) {
    const moved = cells.map((c) => {
      const [x, y] = t(c.x, c.y);
      return { x, y, char: c.char };
    });
    const minX = Math.min(...moved.map((c) => c.x));
    const minY = Math.min(...moved.map((c) => c.y));
    const text = moved
      .map((c) => ({ x: c.x - minX, y: c.y - minY, char: c.char }))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((c) => `${c.x},${c.y},${c.char}`)
      .join(";");
    if (best === null || text < best) best = text;
  }
  return best ?? "";
}

function failed(seed: number, failure: SolveFailure, nameProblems: SolveResult["nameProblems"] = []): SolveResult {
  return {
    seed,
    layouts: [],
    failure,
    nameProblems,
    stats: { restarts: 0, nodesEvaluated: 0, completeLayoutsFound: 0, distinctLayoutsFound: 0 },
  };
}

function toLayout(names: readonly NormalizedName[], places: Place[], seed: number): CrosswordLayout {
  const minX = Math.min(...places.map((p) => p.x));
  const minY = Math.min(...places.map((p) => p.y));
  const placements: NamePlacement[] = places.map((p, i) => ({
    nameId: names[i]!.id,
    start: { x: p.x - minX, y: p.y - minY },
    direction: p.dir === 0 ? "horizontal" : "vertical",
  }));
  return { id: "", seed, placements, decorativeTiles: [], offset: { xMm: 0, yMm: 0 } };
}

export function solve(input: SolveInput): SolveResult {
  const settings = input.settings;
  const seed = Number.isFinite(settings.seed) ? Math.trunc(settings.seed) : 0;
  if (input.names.length === 0) return failed(seed, { code: "no-names", message: "Add at least one name." });
  if (input.names.length > MAX_NAMES) {
    return failed(seed, { code: "too-many-names", message: `At most ${MAX_NAMES} names can be arranged.` });
  }
  const { names, problems } = normalizeNames(input.names);
  if (problems.length > 0) {
    return failed(seed, { code: "invalid-names", message: "Fix the highlighted names before generating." }, problems);
  }

  const groups = sharedLetterGroups(names);
  if (groups.length > 1) {
    const textById = new Map(names.map((n) => [n.id, n.display]));
    const listed = groups.map((g) => g.map((id) => textById.get(id)).join(", ")).join(" | ");
    return failed(seed, {
      code: "no-shared-letters",
      message: `These groups of names share no letters with each other, so they cannot be joined by crossings: ${listed}.`,
      groups,
    });
  }

  const weights = sanitizeWeights(settings.weights);
  const checker: FitChecker | null = input.opening ? createFitChecker(input.opening) : null;
  const search = searchLayouts(names, settings.searchMode, seed, weights, checker);

  const entries = input.names;
  const totalChars = names.reduce((sum, n) => sum + n.chars.length, 0);
  const useTotal = weightSum(weights) > 0;
  // Best-ranked representative per picture; first-seen order is kept for the final tie-break.
  const best = new Map<string, { solved: SolvedLayout; order: number }>();
  const tried = new Set<string>();
  const evaluate = (places: Place[]): void => {
    const exact = places.map((p) => `${p.x},${p.y},${p.dir}`).join(";");
    if (tried.has(exact)) return;
    tried.add(exact);
    const layout = toLayout(names, places, seed);
    const cells = layoutCells(names, layout);
    const canonical = canonicalForm(cells);
    const known = best.get(canonical);
    if (!known && best.size >= MAX_POOL) return;
    if (validateLayout(entries, layout).length > 0) return;
    // The id includes orientation, so a layout and its transpose are told apart.
    const oriented = layout.placements.map((p) => `${p.start.x},${p.start.y},${p.direction[0]}`).join(";");
    layout.id = `layout-${seed}-${hashString(`${canonical}|${oriented}`).toString(36)}`;
    const solved = scoreLayout(layout, cells, totalChars - cells.length, names.length, checker, weights);
    if (!known) best.set(canonical, { solved, order: best.size });
    else if (compareRankable(rankKey(solved, 0), rankKey(known.solved, 0), useTotal) < 0) known.solved = solved;
  };
  for (const places of search.complete) {
    evaluate(places);
    // The opening is asymmetric, so the transposed picture (always legal) can fit or score better.
    evaluate(places.map((p): Place => ({ x: p.y, y: p.x, dir: p.dir === 0 ? 1 : 0 })));
  }
  const pool = [...best.values()].sort((a, b) => a.order - b.order).map((e) => e.solved);

  const stats = {
    restarts: search.restarts,
    nodesEvaluated: search.nodesEvaluated,
    completeLayoutsFound: search.complete.length,
    distinctLayoutsFound: pool.length,
  };
  if (pool.length === 0) {
    return {
      seed,
      layouts: [],
      failure: {
        code: "no-arrangement-found",
        message:
          "No arrangement joins every name through matching letters. Try Thorough mode or another seed; joining with decorative tiles comes in a later version.",
      },
      nameProblems: [],
      stats,
    };
  }
  const ranked = rankLayouts(pool, weights).slice(0, MAX_CANDIDATES);
  return { seed, layouts: ranked, nameProblems: [], stats };
}

function rankKey(l: SolvedLayout, order: number) {
  return { total: l.score.total, intersectionCount: l.intersectionCount, area: l.bounds.width * l.bounds.height, order };
}

function scoreLayout(
  layout: CrosswordLayout,
  cells: GridCell[],
  intersectionCount: number,
  nameCount: number,
  checker: FitChecker | null,
  weights: SolveInput["settings"]["weights"],
): SolvedLayout {
  const bounds = cellsBounds(cells);
  const fit = checker ? fitCells(checker, cells) : null;
  const breakdown = computeMetrics({ cells, bounds, intersectionCount, connectorCount: 0, nameCount, fit, checker });
  const issues: LayoutIssue[] = [];
  if (fit && !fit.fits) {
    issues.push({
      code: "exceeds-opening",
      severity: "warning",
      message: `${fit.tilesOutside.length} of ${fit.tileCount} tiles are outside the frame opening.`,
      nameIds: [],
      positions: fit.tilesOutside,
    });
  }
  return {
    layout,
    bounds,
    tileCount: cells.length,
    intersectionCount,
    connectorCount: 0,
    score: { total: combineScore(breakdown, weights), breakdown },
    fit,
    issues,
  };
}

// Re-ranks layouts under new weights without searching again; input order breaks remaining ties.
export function rankLayouts<T extends SolvedLayout>(layouts: readonly T[], weights: SolveInput["settings"]["weights"]): T[] {
  const w = sanitizeWeights(weights);
  const useTotal = weightSum(w) > 0;
  return layouts
    .map((l, order) => {
      const total = combineScore(l.score.breakdown, w);
      return {
        item: { ...l, score: { total, breakdown: l.score.breakdown } },
        key: { total, intersectionCount: l.intersectionCount, area: l.bounds.width * l.bounds.height, order },
      };
    })
    .sort((a, b) => compareRankable(a.key, b.key, useTotal))
    .map(({ item }) => item);
}
