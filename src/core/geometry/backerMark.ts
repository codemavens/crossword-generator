// Placement mark on the backer (CHG-0010): the crossword outline pulled inward so the glued piece covers it.
import { offsetMitre, signedArea } from "./polygonOps.ts";
import type { Ring } from "./types.ts";

export const DEFAULT_BACKER_MARK_INSET_MM = 1;
export const BACKER_MARK_INSET_LIMITS = { min: 0.1, max: 2 } as const;

export const BACKER_MARK_TOO_LARGE_MESSAGE = "Backer mark inset is too large for this crossword; reduce it.";

export const backerMarkInsetOk = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= BACKER_MARK_INSET_LIMITS.min && value <= BACKER_MARK_INSET_LIMITS.max;

export interface BackerMark {
  // Closed rings in frame mm: the inset outer outline, then one larger ring per hole. Empty when there is no mark.
  rings: Ring[];
  // Set when the inset made part of the shape vanish.
  problem: string | null;
}

const NONE: BackerMark = { rings: [], problem: null };
// Clipper rounds coordinates, so the area check allows this much drift per mm of outline, plus a floor.
const AREA_DRIFT_MM = 0.002;
const AREA_FLOOR_MM2 = 0.01;

const perimeter = (ring: Ring): number =>
  ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    return sum + Math.hypot(q.x - p.x, q.y - p.y);
  }, 0);

const netArea = (rings: Ring[]): number => rings.reduce((sum, r) => sum + signedArea(r), 0);

export function buildBackerMark(cut: { outer: Ring; holes: Ring[] }, insetMm: number): BackerMark {
  if (cut.outer.length < 3 || !backerMarkInsetOk(insetMm)) return NONE;
  const source = [cut.outer, ...cut.holes];
  const inset = offsetMitre(source, -insetMm);
  const bad: BackerMark = { rings: [], problem: BACKER_MARK_TOO_LARGE_MESSAGE };
  // One piece must stay one piece: a neck as narrow as twice the inset splits the mark in two.
  if (inset.filter((r) => signedArea(r) > 0).length !== 1) return bad;
  // Growing the mark back must restore the cut area; an arm or wall thinner than twice the inset would not.
  // Hole counts are not compared: a hole touching the edge at a corner legitimately merges into it.
  const restored = offsetMitre(inset, insetMm);
  const tolerance = AREA_FLOOR_MM2 + AREA_DRIFT_MM * source.reduce((sum, r) => sum + perimeter(r), 0);
  if (Math.abs(netArea(restored) - netArea(source)) > tolerance) return bad;
  return { rings: inset, problem: null };
}
