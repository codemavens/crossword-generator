import type { CrosswordLayout, NameEntry } from "../models/project.ts";

export interface Tile {
  x: number;
  y: number;
  char: string;
}

// Hand-built sample; there is no solver yet. Every crossing shares a matching letter.
export const SAMPLE_NAMES: NameEntry[] = [
  { id: "sample-sanders", text: "SANDERS" },
  { id: "sample-anna", text: "ANNA" },
  { id: "sample-ella", text: "ELLA" },
  { id: "sample-sam", text: "SAM" },
  { id: "sample-sue", text: "SUE" },
];

export const SAMPLE_LAYOUT: CrosswordLayout = {
  id: "sample-layout",
  seed: 0,
  decorativeTiles: [],
  offset: { xMm: 0, yMm: 0 },
  placements: [
    { nameId: "sample-sanders", start: { x: 0, y: 2 }, direction: "horizontal" },
    { nameId: "sample-anna", start: { x: 2, y: 1 }, direction: "vertical" }, // N at (2,2)
    { nameId: "sample-ella", start: { x: 4, y: 2 }, direction: "vertical" }, // E at (4,2)
    { nameId: "sample-sam", start: { x: 0, y: 2 }, direction: "vertical" }, // S at (0,2)
    { nameId: "sample-sue", start: { x: 6, y: 2 }, direction: "vertical" }, // S at (6,2)
  ],
};

// One tile per occupied cell; throws if two placements disagree on a letter.
export function occupiedTiles(names: NameEntry[], layout: CrosswordLayout): Tile[] {
  const textById = new Map(names.map((n) => [n.id, n.text]));
  const cells = new Map<string, Tile>();
  for (const placement of layout.placements) {
    const text = textById.get(placement.nameId);
    if (text === undefined) throw new Error(`Unknown name id: ${placement.nameId}`);
    const chars = Array.from(text.toUpperCase());
    chars.forEach((char, i) => {
      const x = placement.start.x + (placement.direction === "horizontal" ? i : 0);
      const y = placement.start.y + (placement.direction === "vertical" ? i : 0);
      const key = `${x},${y}`;
      const existing = cells.get(key);
      if (existing && existing.char !== char) {
        throw new Error(`Conflict at (${x}, ${y}): "${existing.char}" vs "${char}"`);
      }
      cells.set(key, { x, y, char });
    });
  }
  return [...cells.values()];
}
