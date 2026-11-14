import type { CrosswordLayout, Direction, GridPosition } from "../models/project.ts";
import type { NormalizedName } from "./normalize.ts";
import type { LayoutBounds } from "./types.ts";

export interface GridCell {
  x: number;
  y: number;
  char: string;
}

export function step(direction: Direction): GridPosition {
  return direction === "horizontal" ? { x: 1, y: 0 } : { x: 0, y: 1 };
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

// One cell per occupied square; on a conflict the first character wins (the validator reports it).
export function layoutCells(names: readonly NormalizedName[], layout: CrosswordLayout): GridCell[] {
  const byId = new Map(names.map((n) => [n.id, n]));
  const cells = new Map<string, GridCell>();
  for (const p of layout.placements) {
    const name = byId.get(p.nameId);
    if (!name) continue;
    const d = step(p.direction);
    name.chars.forEach((char, i) => {
      const x = p.start.x + d.x * i;
      const y = p.start.y + d.y * i;
      const key = cellKey(x, y);
      if (!cells.has(key)) cells.set(key, { x, y, char });
    });
  }
  return [...cells.values()];
}

export function cellsBounds(cells: readonly GridPosition[]): LayoutBounds {
  if (cells.length === 0) return { minX: 0, minY: 0, maxX: -1, maxY: -1, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
