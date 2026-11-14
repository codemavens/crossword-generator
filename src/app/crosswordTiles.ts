import type { CrosswordLayout, NameEntry } from "../core/models/project.ts";
import { normalizeNameText } from "../core/models/validation.ts";

export interface LayoutTile {
  x: number;
  y: number;
  char: string;
}

// One tile per normalised character; crossings share a tile.
export function layoutTiles(layout: CrosswordLayout, names: NameEntry[]): LayoutTile[] {
  const textById = new Map(names.map((n) => [n.id, n.text]));
  const tiles = new Map<string, LayoutTile>();
  for (const p of layout.placements) {
    const result = normalizeNameText(textById.get(p.nameId) ?? "");
    if (!result.ok) continue;
    result.chars.forEach((char, i) => {
      const x = p.start.x + (p.direction === "horizontal" ? i : 0);
      const y = p.start.y + (p.direction === "vertical" ? i : 0);
      tiles.set(`${x},${y}`, { x, y, char });
    });
  }
  return [...tiles.values()];
}
