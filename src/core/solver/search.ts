// Multi-start beam search over natural intersections (SPEC §7). Budgets are counted, never timed.
import type { SearchMode, SolverWeights } from "../models/project.ts";
import type { FitChecker } from "./fit.ts";
import type { NormalizedName } from "./normalize.ts";
import { createRng, shuffled, type Rng } from "./rng.ts";
import { compactnessMetric, sanitizeWeights, weightSum } from "./score.ts";

export interface SearchBudget {
  restarts: number;
  beamWidth: number;
  // Cap on candidate placements checked across the whole solve.
  maxNodes: number;
}

export const SEARCH_BUDGETS: Record<SearchMode, SearchBudget> = {
  quick: { restarts: 8, beamWidth: 24, maxNodes: 300_000 },
  balanced: { restarts: 20, beamWidth: 64, maxNodes: 2_000_000 },
  thorough: { restarts: 48, beamWidth: 160, maxNodes: 6_000_000 },
};

// Placement per name index; dir 0 = horizontal, 1 = vertical.
export interface Place {
  x: number;
  y: number;
  dir: 0 | 1;
}

export interface SearchOutput {
  // Complete arrangements in discovery order (may contain picture duplicates).
  complete: Place[][];
  restarts: number;
  nodesEvaluated: number;
}

interface Cell {
  ch: string;
  h: number;
  v: number;
}

interface State {
  cells: Map<number, Cell>;
  keys: number[];
  places: (Place | null)[];
  hash: number;
  crossings: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  sumX: number;
  sumY: number;
}

interface Child {
  parent: State;
  name: number;
  place: Place;
  score: number;
  hash: number;
  crossings: number;
}

const BIAS = 2048;
const SPAN = 4096;
const key = (x: number, y: number): number => (x + BIAS) * SPAN + (y + BIAS);

function mix(a: number): number {
  a = Math.imul(a ^ (a >>> 16), 0x7feb352d);
  a = Math.imul(a ^ (a >>> 15), 0x846ca68b);
  return (a ^ (a >>> 16)) >>> 0;
}

// Order-independent state hash; identical names share a group so swapping them is the same state.
function placeHash(group: number, p: Place): [number, number] {
  const h1 = mix(mix(mix(group + 0x9e3779b9) ^ (p.x + BIAS)) ^ ((p.y + BIAS) | (p.dir << 13)));
  return [h1, mix(h1 ^ 0x5bd1e995)];
}

function hashKey(h1: number, h2: number): number {
  return h1 * 2097152 + (h2 & 0x1fffff);
}

interface Prepared {
  chars: string[];
  group: number;
  positions: Map<string, number[]>;
}

function prepare(names: readonly NormalizedName[]): Prepared[] {
  const groups = new Map<string, number>();
  return names.map((n, i) => {
    const text = n.chars.join("\u0000");
    if (!groups.has(text)) groups.set(text, i);
    const positions = new Map<string, number[]>();
    n.chars.forEach((ch, k) => positions.set(ch, [...(positions.get(ch) ?? []), k]));
    return { chars: n.chars, group: groups.get(text)!, positions };
  });
}

export function searchLayouts(
  names: readonly NormalizedName[],
  mode: SearchMode,
  seed: number,
  weights: SolverWeights,
  checker: FitChecker | null,
): SearchOutput {
  const budget = SEARCH_BUDGETS[mode] ?? SEARCH_BUDGETS.balanced;
  const rng = createRng(seed);
  const prepared = prepare(names);
  const n = prepared.length;
  const complete: Place[][] = [];
  let nodes = 0;
  let restarts = 0;
  if (n === 0) return { complete, restarts, nodesEvaluated: 0 };

  // Guidance weights; with every weight off the search still needs some direction.
  let w = sanitizeWeights(weights);
  if (weightSum(w) === 0) w = { circularFit: 1, compactness: 1, visualBalance: 1, naturalIntersections: 1, fewConnectors: 0 };
  const wFit = checker && !checker.empty ? w.circularFit : 0;
  const wSum = w.naturalIntersections + w.compactness + w.visualBalance + wFit || 1;

  const startOrder = shuffled(
    prepared.map((_, i) => i),
    rng,
  );
  const dirBit = rng() < 0.5 ? 0 : 1;

  // Once the node budget runs out, the current restart finishes greedily (beam of 1) and no new one starts.
  let exhausted = false;
  for (let r = 0; r < budget.restarts && !exhausted; r++) {
    restarts++;
    const first = startOrder[r % n]!;
    const dir = ((Math.floor(r / n) + dirBit) % 2) as 0 | 1;
    let beam: State[] = [initialState(prepared, first, dir)];
    for (let depth = 1; depth < n && beam.length > 0; depth++) {
      const children: Child[] = [];
      for (const state of beam) {
        nodes += expand(state, prepared, children, (c) => partialScore(c, depth + 1, rng));
        if (nodes >= budget.maxNodes) exhausted = true;
        if (exhausted && children.length > 0) break;
      }
      children.sort((a, b) => b.score - a.score);
      const width = exhausted ? 1 : budget.beamWidth;
      const next: State[] = [];
      const seen = new Set<number>();
      for (const child of children) {
        if (seen.has(child.hash)) continue;
        seen.add(child.hash);
        next.push(materialise(child, prepared));
        if (next.length >= width) break;
      }
      beam = next;
    }
    for (const state of beam) complete.push(state.places.map((p) => p!));
  }
  return { complete, restarts, nodesEvaluated: nodes };

  function partialScore(c: Omit<Child, "score">, placed: number, random: Rng): number {
    const s = c.parent;
    const name = prepared[c.name]!;
    const len = name.chars.length;
    const dx = c.place.dir === 0 ? 1 : 0;
    const dy = 1 - dx;
    const minX = Math.min(s.minX, c.place.x);
    const minY = Math.min(s.minY, c.place.y);
    const maxX = Math.max(s.maxX, c.place.x + dx * (len - 1));
    const maxY = Math.max(s.maxY, c.place.y + dy * (len - 1));
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const added = len - (c.crossings - s.crossings);
    const tiles = s.keys.length + added;
    // Approximate centre of mass: new tiles counted along the whole name.
    const sumX = s.sumX + (c.place.x + 0.5 + (dx * (len - 1)) / 2) * added;
    const sumY = s.sumY + (c.place.y + 0.5 + (dy * (len - 1)) / 2) * added;
    const comX = (sumX / tiles - (minX + bw / 2)) / (bw / 2);
    const comY = (sumY / tiles - (minY + bh / 2)) / (bh / 2);
    const mI = Math.min(1, c.crossings / (2 * Math.max(1, placed - 1)));
    const mC = compactnessMetric(tiles, bw, bh);
    const mB = 1 - Math.min(1, Math.hypot(comX, comY) / Math.SQRT2);
    const mF = wFit > 0 ? Math.min(1, (0.85 * checker!.width) / bw) * Math.min(1, (0.85 * checker!.height) / bh) : 0;
    const base = (w.naturalIntersections * mI + w.compactness * mC + w.visualBalance * mB + wFit * mF) / wSum;
    return base + 0.03 * random();
  }
}

function initialState(prepared: Prepared[], first: number, dir: 0 | 1): State {
  const state: State = {
    cells: new Map(),
    keys: [],
    places: prepared.map(() => null),
    hash: 0,
    crossings: 0,
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
    sumX: 0,
    sumY: 0,
  };
  const place: Place = { x: 0, y: 0, dir };
  const [h1, h2] = placeHash(prepared[first]!.group, place);
  state.hash = hashKey(h1, h2);
  addName(state, prepared, first, place);
  return state;
}

function addName(state: State, prepared: Prepared[], index: number, place: Place): void {
  const chars = prepared[index]!.chars;
  const dx = place.dir === 0 ? 1 : 0;
  const dy = 1 - dx;
  state.places[index] = place;
  chars.forEach((ch, k) => {
    const x = place.x + dx * k;
    const y = place.y + dy * k;
    const id = key(x, y);
    const existing = state.cells.get(id);
    if (existing) {
      state.cells.set(id, place.dir === 0 ? { ...existing, h: index } : { ...existing, v: index });
      return;
    }
    state.cells.set(id, { ch, h: place.dir === 0 ? index : -1, v: place.dir === 1 ? index : -1 });
    state.keys.push(id);
    state.sumX += x + 0.5;
    state.sumY += y + 0.5;
    state.minX = Math.min(state.minX, x);
    state.minY = Math.min(state.minY, y);
    state.maxX = Math.max(state.maxX, x);
    state.maxY = Math.max(state.maxY, y);
  });
}

function materialise(child: Child, prepared: Prepared[]): State {
  const p = child.parent;
  const state: State = {
    cells: new Map(p.cells),
    keys: p.keys.slice(),
    places: p.places.slice(),
    hash: child.hash,
    crossings: child.crossings,
    minX: p.minX,
    minY: p.minY,
    maxX: p.maxX,
    maxY: p.maxY,
    sumX: p.sumX,
    sumY: p.sumY,
  };
  addName(state, prepared, child.name, child.place);
  return state;
}

// Mirrors validateLayout's rules for one added name: returns the crossing count, or -1 if illegal.
function placementCrossings(state: State, chars: string[], place: Place): number {
  const dx = place.dir === 0 ? 1 : 0;
  const dy = 1 - dx;
  const len = chars.length;
  if (state.cells.has(key(place.x - dx, place.y - dy))) return -1;
  if (state.cells.has(key(place.x + dx * len, place.y + dy * len))) return -1;
  let crossings = 0;
  for (let k = 0; k < len; k++) {
    const x = place.x + dx * k;
    const y = place.y + dy * k;
    const cell = state.cells.get(key(x, y));
    if (cell) {
      if (cell.ch !== chars[k]) return -1;
      if ((place.dir === 0 ? cell.h : cell.v) >= 0) return -1;
      crossings++;
    } else if (state.cells.has(key(x + dy, y + dx)) || state.cells.has(key(x - dy, y - dx))) {
      return -1;
    }
  }
  return crossings;
}

// Adds every legal child of `state` to `out`; returns the number of candidates checked.
function expand(
  state: State,
  prepared: Prepared[],
  out: Child[],
  score: (c: Omit<Child, "score">) => number,
): number {
  const unplaced: number[] = [];
  const groupsTaken = new Set<number>();
  prepared.forEach((p, i) => {
    if (state.places[i] !== null || groupsTaken.has(p.group)) return;
    groupsTaken.add(p.group);
    unplaced.push(i);
  });
  const tried = new Set<number>();
  let checked = 0;
  const h1 = Math.floor(state.hash / 2097152);
  const h2 = state.hash % 2097152;
  for (const id of state.keys) {
    const cell = state.cells.get(id)!;
    if (cell.h >= 0 && cell.v >= 0) continue;
    const dir: 0 | 1 = cell.h >= 0 ? 1 : 0;
    const x = Math.floor(id / SPAN) - BIAS;
    const y = (id % SPAN) - BIAS;
    for (const j of unplaced) {
      const positions = prepared[j]!.positions.get(cell.ch);
      if (!positions) continue;
      for (const b of positions) {
        const place: Place = { x: dir === 0 ? x - b : x, y: dir === 1 ? y - b : y, dir };
        const candidate = ((j * 2 + dir) * SPAN + place.x + BIAS) * SPAN + place.y + BIAS;
        if (tried.has(candidate)) continue;
        tried.add(candidate);
        checked++;
        const crossings = placementCrossings(state, prepared[j]!.chars, place);
        if (crossings < 1) continue;
        const [p1, p2] = placeHash(prepared[j]!.group, place);
        const hash = hashKey((h1 ^ p1) >>> 0, (h2 ^ p2) & 0x1fffff);
        const partial = { parent: state, name: j, place, hash, crossings: state.crossings + crossings };
        out.push({ ...partial, score: score(partial) });
      }
    }
  }
  return checked;
}
