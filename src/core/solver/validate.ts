// Structural validator (SPEC §6.1 as amended, §19.1). Independent of the search; the single source of the rules.
import type { CrosswordLayout, Direction, GridPosition, NameEntry, NamePlacement } from "../models/project.ts";
import { normalizeNameText } from "../models/validation.ts";
import { cellKey, step } from "./grid.ts";
import type { LayoutIssue, LayoutIssueCode } from "./types.ts";

interface Occupant {
  name: number;
  char: string;
  direction: Direction;
}

interface Placed {
  id: string;
  display: string;
  chars: string[];
  placement: NamePlacement;
}

function issue(code: LayoutIssueCode, message: string, nameIds: string[], positions: GridPosition[] = []): LayoutIssue {
  return { code, severity: "error", message, nameIds, positions };
}

function isValidPlacement(p: unknown): p is NamePlacement {
  if (typeof p !== "object" || p === null) return false;
  const v = p as Partial<NamePlacement>;
  return (
    typeof v.nameId === "string" &&
    typeof v.start === "object" &&
    v.start !== null &&
    Number.isSafeInteger(v.start.x) &&
    Number.isSafeInteger(v.start.y) &&
    (v.direction === "horizontal" || v.direction === "vertical")
  );
}

function at(p: GridPosition): string {
  return `(${p.x}, ${p.y})`;
}

// Decorative tiles are not supported until the connector task (Phase 3); any present are reported as an error.
export function validateLayout(names: NameEntry[], layout: CrosswordLayout): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const entries = new Map<string, NameEntry>();
  for (const n of names) if (!entries.has(n.id)) entries.set(n.id, n);

  const placedById = new Map<string, Placed>();
  const badText = new Set<string>();
  for (const [id, entry] of entries) {
    const result = normalizeNameText(entry.text);
    if (result.ok) continue;
    badText.add(id);
    const code = result.problem === "too-short" ? "name-too-short" : "invalid-name-text";
    issues.push(issue(code, `${entry.text.trim() || "(empty)"}: ${result.message}`, [id]));
  }

  const placements = Array.isArray(layout.placements) ? layout.placements : [];
  for (const raw of placements) {
    if (!isValidPlacement(raw)) {
      issues.push(issue("invalid-placement", "A placement has an invalid position or direction.", []));
      continue;
    }
    const entry = entries.get(raw.nameId);
    if (!entry) {
      issues.push(issue("unknown-name", `A placement refers to a name that is not in the list (${raw.nameId}).`, [raw.nameId]));
      continue;
    }
    if (placedById.has(raw.nameId)) {
      issues.push(issue("duplicate-placement", `${entry.text.trim()} is placed more than once.`, [raw.nameId], [raw.start]));
      continue;
    }
    const result = normalizeNameText(entry.text);
    placedById.set(raw.nameId, {
      id: raw.nameId,
      display: entry.text.trim(),
      chars: result.ok ? result.chars : [],
      placement: raw,
    });
  }
  for (const [id, entry] of entries) {
    if (!placedById.has(id) && !badText.has(id)) {
      issues.push(issue("missing-name", `${entry.text.trim()} is not in the crossword.`, [id]));
    }
  }
  if (Array.isArray(layout.decorativeTiles) && layout.decorativeTiles.length > 0) {
    issues.push(
      issue(
        "decorative-tiles-not-supported",
        "Decorative tiles are not supported yet.",
        [],
        layout.decorativeTiles.map((t) => t.position),
      ),
    );
  }

  // Geometry only for names whose text is valid.
  const placed = [...placedById.values()].filter((p) => p.chars.length > 0);
  const cells = new Map<string, { pos: GridPosition; occ: Occupant[] }>();
  placed.forEach((p, idx) => {
    const d = step(p.placement.direction);
    p.chars.forEach((char, i) => {
      const pos = { x: p.placement.start.x + d.x * i, y: p.placement.start.y + d.y * i };
      const key = cellKey(pos.x, pos.y);
      let cell = cells.get(key);
      if (!cell) cells.set(key, (cell = { pos, occ: [] }));
      cell.occ.push({ name: idx, char, direction: p.placement.direction });
    });
  });

  const parent = placed.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const pairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const overlaps = new Map<string, { a: number; b: number; positions: GridPosition[] }>();
  const conflicts = new Map<string, { a: number; b: number; positions: GridPosition[] }>();

  for (const cell of cells.values()) {
    for (let i = 0; i < cell.occ.length; i++) {
      for (let j = i + 1; j < cell.occ.length; j++) {
        const a = cell.occ[i]!;
        const b = cell.occ[j]!;
        const key = pairKey(a.name, b.name);
        if (a.direction === b.direction) {
          const o = overlaps.get(key) ?? { a: a.name, b: b.name, positions: [] };
          o.positions.push(cell.pos);
          overlaps.set(key, o);
        } else if (a.char !== b.char) {
          const c = conflicts.get(key) ?? { a: a.name, b: b.name, positions: [] };
          c.positions.push(cell.pos);
          conflicts.set(key, c);
        } else {
          parent[find(a.name)] = find(b.name);
        }
      }
    }
  }
  for (const { a, b, positions } of conflicts.values()) {
    const [na, nb] = [placed[a]!, placed[b]!];
    issues.push(
      issue(
        "conflicting-characters",
        `${na.display} and ${nb.display} cross at ${positions.map(at).join(", ")} with different characters.`,
        [na.id, nb.id],
        positions,
      ),
    );
  }
  for (const { a, b, positions } of overlaps.values()) {
    const [na, nb] = [placed[a]!, placed[b]!];
    const contained = positions.length === Math.min(na.chars.length, nb.chars.length);
    issues.push(
      contained
        ? issue("contained-name", `${na.display} and ${nb.display} lie on top of each other in the same direction.`, [na.id, nb.id], positions)
        : issue("parallel-overlap", `${na.display} and ${nb.display} overlap in the same direction.`, [na.id, nb.id], positions),
    );
  }

  // The squares just before and after each name must be empty.
  const endPairs = new Set<string>();
  placed.forEach((p, idx) => {
    const d = step(p.placement.direction);
    const s = p.placement.start;
    const len = p.chars.length;
    const ends: [GridPosition, GridPosition, string][] = [
      [{ x: s.x - d.x, y: s.y - d.y }, s, "before"],
      [{ x: s.x + d.x * len, y: s.y + d.y * len }, { x: s.x + d.x * (len - 1), y: s.y + d.y * (len - 1) }, "after"],
    ];
    for (const [outside, inside, label] of ends) {
      const cell = cells.get(cellKey(outside.x, outside.y));
      if (!cell) continue;
      endPairs.add(`${cellKey(outside.x, outside.y)}|${cellKey(inside.x, inside.y)}`);
      endPairs.add(`${cellKey(inside.x, inside.y)}|${cellKey(outside.x, outside.y)}`);
      const others = [...new Set(cell.occ.map((o) => o.name))].filter((n) => n !== idx);
      issues.push(
        issue(
          "end-not-clear",
          `The square ${label} ${p.display} at ${at(outside)} is occupied by ${others.map((n) => placed[n]!.display).join(", ")}.`,
          [p.id, ...others.map((n) => placed[n]!.id)],
          [outside],
        ),
      );
    }
  });

  // Edge-sharing squares are legal only when one name runs through both.
  const contacts = new Map<string, { names: Set<number>; positions: GridPosition[] }>();
  for (const cell of cells.values()) {
    for (const d of [step("horizontal"), step("vertical")]) {
      const nx = cell.pos.x + d.x;
      const ny = cell.pos.y + d.y;
      const other = cells.get(cellKey(nx, ny));
      if (!other) continue;
      if (endPairs.has(`${cellKey(cell.pos.x, cell.pos.y)}|${cellKey(nx, ny)}`)) continue;
      const here = new Set(cell.occ.map((o) => o.name));
      if (other.occ.some((o) => here.has(o.name))) continue;
      const involved = new Set([...here, ...other.occ.map((o) => o.name)]);
      const key = [...involved].sort((p, q) => p - q).join("|");
      const c = contacts.get(key) ?? { names: involved, positions: [] };
      c.positions.push(cell.pos, { x: nx, y: ny });
      contacts.set(key, c);
    }
  }
  for (const c of contacts.values()) {
    const list = [...c.names].map((n) => placed[n]!);
    issues.push(
      issue(
        "side-by-side",
        `${list.map((p) => p.display).join(" and ")} touch side by side without crossing.`,
        list.map((p) => p.id),
        c.positions,
      ),
    );
  }

  if (placed.length > 1) {
    const groups = new Map<number, Placed[]>();
    placed.forEach((p, i) => {
      const root = find(i);
      groups.set(root, [...(groups.get(root) ?? []), p]);
    });
    if (groups.size > 1) {
      const text = [...groups.values()].map((g) => g.map((p) => p.display).join(", ")).join(" | ");
      issues.push(issue("disconnected", `The crossword is in ${groups.size} separate pieces: ${text}.`, placed.map((p) => p.id)));
    }
  }
  return issues;
}
