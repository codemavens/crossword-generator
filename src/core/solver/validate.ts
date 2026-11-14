// Structural validator (SPEC §6.1 as amended, §6.4–6.5, §19.1). Independent of the search; the single source of the rules.
import type { CrosswordLayout, DecorativeTile, Direction, GridPosition, NameEntry, NamePlacement } from "../models/project.ts";
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

// A decorative tile that passed the data and position checks.
interface Tile {
  pos: GridPosition;
  purpose: DecorativeTile["purpose"];
  anchor: number;
  // Unit step from the anchor name's end square to the tile.
  out: GridPosition;
  // Index into `placed`, or -1 for a decoration.
  joins: number;
  // Connector with a legal L-corner or T-shape between perpendicular names.
  joinsLegally: boolean;
  label: string;
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

function isValidTile(t: unknown): t is DecorativeTile {
  if (typeof t !== "object" || t === null) return false;
  const v = t as Partial<DecorativeTile>;
  return (
    typeof v.id === "string" &&
    typeof v.position === "object" &&
    v.position !== null &&
    Number.isSafeInteger(v.position.x) &&
    Number.isSafeInteger(v.position.y) &&
    (v.source === "automatic" || v.source === "manual") &&
    (v.purpose === "connector" || v.purpose === "decoration") &&
    typeof v.anchor === "object" &&
    v.anchor !== null &&
    typeof v.anchor.nameId === "string" &&
    (v.anchor.end === "start" || v.anchor.end === "end") &&
    (v.joinsNameId === undefined || typeof v.joinsNameId === "string")
  );
}

function at(p: GridPosition): string {
  return `(${p.x}, ${p.y})`;
}

function same(a: GridPosition, b: GridPosition): boolean {
  return a.x === b.x && a.y === b.y;
}

// The empty square just before the first character or just after the last.
export function outsideSquare(placement: NamePlacement, length: number, end: "start" | "end"): GridPosition {
  const d = step(placement.direction);
  const s = placement.start;
  return end === "start" ? { x: s.x - d.x, y: s.y - d.y } : { x: s.x + d.x * length, y: s.y + d.y * length };
}

function covers(p: Placed, pos: GridPosition): boolean {
  const s = p.placement.start;
  const k = p.placement.direction === "horizontal" ? pos.x - s.x : pos.y - s.y;
  const inLine = p.placement.direction === "horizontal" ? pos.y === s.y : pos.x === s.x;
  return inLine && k >= 0 && k < p.chars.length;
}

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

  // Geometry only for names whose text is valid.
  const placed = [...placedById.values()].filter((p) => p.chars.length > 0);
  const indexById = new Map(placed.map((p, i) => [p.id, i]));
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

  const tileAt = checkTiles(layout, entries, placed, indexById, cells, issues);

  // The squares just before and after each name must be empty, or hold a tile attached to that name.
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
      const tile = tileAt.get(cellKey(outside.x, outside.y));
      if (tile && tile.anchor !== idx && tile.joins !== idx) {
        issues.push(
          issue(
            "end-not-clear",
            `The square ${label} ${p.display} at ${at(outside)} holds the ${tile.label}, which is not attached to ${p.display}.`,
            [p.id, placed[tile.anchor]!.id],
            [outside],
          ),
        );
      }
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

  checkTileContacts(tileAt, placed, cells, issues);

  // Connectors join their two names; contact alone never does.
  for (const t of tileAt.values()) if (t.joinsLegally) parent[find(t.anchor)] = find(t.joins);

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

// Data, position, end, shape and pairing rules for each tile; returns the tiles that sit on a legal anchor square, by square.
function checkTiles(
  layout: CrosswordLayout,
  entries: Map<string, NameEntry>,
  placed: Placed[],
  indexById: Map<string, number>,
  cells: Map<string, { pos: GridPosition; occ: Occupant[] }>,
  issues: LayoutIssue[],
): Map<string, Tile> {
  const tileAt = new Map<string, Tile>();
  const raw: unknown[] = Array.isArray(layout.decorativeTiles) ? layout.decorativeTiles : [];
  const ids = new Set<string>();
  const pairs = new Set<string>();
  const nameText = (id: string) => entries.get(id)?.text.trim() ?? id;

  raw.forEach((t, i) => {
    if (!isValidTile(t)) {
      issues.push(issue("invalid-decorative-tile", `Decorative tile ${i + 1} has invalid data.`, []));
      return;
    }
    if (ids.has(t.id)) {
      issues.push(issue("duplicate-tile-id", `Two decorative tiles share the id ${t.id}.`, [], [t.position]));
      return;
    }
    ids.add(t.id);
    const anchorName = nameText(t.anchor.nameId);
    const kind = t.purpose === "connector" ? "connector" : "decorative tile";
    const label = `${kind} ${t.anchor.end === "start" ? "before" : "after"} ${anchorName}`;
    const unknown = [t.anchor.nameId, ...(t.joinsNameId === undefined ? [] : [t.joinsNameId])].filter((id) => !entries.has(id));
    if (unknown.length > 0) {
      issues.push(issue("tile-unknown-name", `The ${label} refers to a name that is not in the list (${unknown.join(", ")}).`, unknown, [t.position]));
      return;
    }
    if (t.purpose === "connector" ? t.joinsNameId === undefined || t.joinsNameId === t.anchor.nameId : t.joinsNameId !== undefined) {
      const why = t.purpose === "connector" ? "must join one other name" : "cannot join another name";
      issues.push(issue("invalid-decorative-tile", `The ${label} ${why}.`, [t.anchor.nameId], [t.position]));
      return;
    }
    const anchor = indexById.get(t.anchor.nameId);
    const joins = t.joinsNameId === undefined ? -1 : indexById.get(t.joinsNameId);
    // Names that are missing or have bad text are already reported.
    if (anchor === undefined || joins === undefined) return;

    const key = cellKey(t.position.x, t.position.y);
    const occupied = cells.get(key);
    if (occupied) {
      const on = [...new Set(occupied.occ.map((o) => placed[o.name]!))];
      const where = on.some((p) => p.id === t.anchor.nameId) ? "inside" : "on";
      issues.push(
        issue(
          "tile-overlaps-name",
          `The ${label} at ${at(t.position)} is ${where} ${on.map((p) => p.display).join(" and ")}.`,
          [t.anchor.nameId, ...on.map((p) => p.id).filter((id) => id !== t.anchor.nameId)],
          [t.position],
        ),
      );
      return;
    }
    const other = tileAt.get(key);
    if (other) {
      issues.push(issue("tile-overlaps-tile", `The ${label} and the ${other.label} are on the same square ${at(t.position)}; a name end holds at most one tile.`, [t.anchor.nameId], [t.position]));
      return;
    }
    const a = placed[anchor]!;
    const expected = outsideSquare(a.placement, a.chars.length, t.anchor.end);
    if (!same(expected, t.position)) {
      issues.push(
        issue(
          "tile-not-at-name-end",
          `The ${label} at ${at(t.position)} must be on the square just ${t.anchor.end === "start" ? "before" : "after"} ${a.display} ${at(expected)}.`,
          [a.id],
          [t.position],
        ),
      );
      return;
    }
    const d = step(a.placement.direction);
    const sign = t.anchor.end === "start" ? -1 : 1;
    const tile: Tile = {
      pos: t.position,
      purpose: t.purpose,
      anchor,
      out: { x: d.x * sign, y: d.y * sign },
      joins,
      joinsLegally: false,
      label,
    };
    tileAt.set(key, tile);

    // A second tile at the same name end (including the joined end of an L-corner) is on this same square, reported above.
    if (t.purpose !== "connector") return;

    const b = placed[joins]!;
    const pk = anchor < joins ? `${anchor}|${joins}` : `${joins}|${anchor}`;
    if (pairs.has(pk)) {
      issues.push(issue("duplicate-connector", `${a.display} and ${b.display} are joined by more than one connector.`, [a.id, b.id], [t.position]));
      return;
    }
    pairs.add(pk);
    if (a.placement.direction === b.placement.direction) {
      issues.push(issue("connector-parallel-names", `The ${label} joins ${a.display} and ${b.display}, which run in the same direction.`, [a.id, b.id], [t.position]));
      return;
    }
    // L-corner: the tile is also just before or after the joined name. T-shape: the joined name passes the far side of the tile.
    const lCorner = (["start", "end"] as const).some((e) => same(outsideSquare(b.placement, b.chars.length, e), t.position));
    const tShape = covers(b, { x: t.position.x + tile.out.x, y: t.position.y + tile.out.y });
    if (!lCorner && !tShape) {
      issues.push(
        issue(
          "connector-shape-invalid",
          `The ${label} does not join ${b.display}: ${b.display} must start or end next to it, or pass its far side.`,
          [a.id, b.id],
          [t.position],
        ),
      );
      return;
    }
    tile.joinsLegally = true;
  });
  return tileAt;
}

// A connector may touch only its two names; a decoration only its anchor's end square; tiles never touch each other.
function checkTileContacts(
  tileAt: Map<string, Tile>,
  placed: Placed[],
  cells: Map<string, { pos: GridPosition; occ: Occupant[] }>,
  issues: LayoutIssue[],
): void {
  const chains = new Set<string>();
  for (const t of tileAt.values()) {
    const endSquare = { x: t.pos.x - t.out.x, y: t.pos.y - t.out.y };
    const strangers = new Set<number>();
    const positions: GridPosition[] = [];
    for (const d of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const nb = { x: t.pos.x + d.x, y: t.pos.y + d.y };
      const nk = cellKey(nb.x, nb.y);
      const neighbour = tileAt.get(nk);
      if (neighbour) {
        const k = [cellKey(t.pos.x, t.pos.y), nk].sort().join("|");
        if (!chains.has(k)) {
          chains.add(k);
          issues.push(
            issue(
              "tile-chain",
              `The ${t.label} and the ${neighbour.label} touch; decorative tiles cannot be chained.`,
              [...new Set([placed[t.anchor]!.id, placed[neighbour.anchor]!.id])],
              [t.pos, nb],
            ),
          );
        }
        continue;
      }
      const cell = cells.get(nk);
      if (!cell) continue;
      const names = cell.occ.map((o) => o.name);
      const allowed = t.purpose === "connector" ? names.some((n) => n === t.anchor || n === t.joins) : same(nb, endSquare);
      if (allowed) continue;
      for (const n of names) strangers.add(n);
      positions.push(nb);
    }
    if (strangers.size === 0) continue;
    const list = [...strangers].map((n) => placed[n]!);
    const anchor = placed[t.anchor]!;
    issues.push(
      t.purpose === "connector"
        ? issue(
            "connector-touches-other-name",
            `The ${t.label} touches ${list.map((p) => p.display).join(" and ")}; it may touch only ${anchor.display} and ${placed[t.joins]!.display}.`,
            [anchor.id, ...list.map((p) => p.id)],
            [t.pos, ...positions],
          )
        : issue(
            "decoration-touches-name",
            `The ${t.label} touches ${list.map((p) => p.display).join(" and ")}; it may touch only the end of ${anchor.display}.`,
            [anchor.id, ...list.map((p) => p.id)],
            [t.pos, ...positions],
          ),
    );
  }
}
