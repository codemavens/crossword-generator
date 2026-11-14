// Manual end tiles (SPEC §6.5). Eligibility is decided by validateLayout alone, so the editor and the solver share one rule set.
import type { CrosswordLayout, DecorativeTile, NameEntry } from "../models/project.ts";
import { normalizeNameText } from "../models/validation.ts";
import type { AddDecorationResult, DecorationEnd, DecorationSpot, LayoutIssue } from "./types.ts";
import { outsideSquare, validateLayout } from "./validate.ts";

function issueKey(i: LayoutIssue): string {
  return `${i.code}|${i.message}`;
}

function manualTile(nameId: string, end: DecorationEnd, position: { x: number; y: number }): DecorativeTile {
  return {
    id: `manual-${nameId}-${end}`,
    position,
    artworkId: null,
    source: "manual",
    purpose: "decoration",
    anchor: { nameId, end },
  };
}

// Grid coordinates are kept as they are: a tile before a name at x = 0 sits at x = -1, and bounds and centring follow it.
function tryAdd(names: NameEntry[], layout: CrosswordLayout, nameId: string, end: DecorationEnd, before: Set<string>): AddDecorationResult {
  const placement = layout.placements.find((p) => p.nameId === nameId);
  const entry = names.find((n) => n.id === nameId);
  if (!placement || !entry) return { ok: false, message: "That name is not in the crossword." };
  const text = normalizeNameText(entry.text);
  if (!text.ok) return { ok: false, message: `${entry.text.trim()}: ${text.message}` };
  const tile = manualTile(nameId, end, outsideSquare(placement, text.chars.length, end));
  const next: CrosswordLayout = { ...layout, decorativeTiles: [...layout.decorativeTiles, tile] };
  // Only problems the new tile introduces count; an already-broken layout is not blamed on it.
  const added = validateLayout(names, next).filter((i) => i.severity === "error" && !before.has(issueKey(i)));
  if (added.length > 0) return { ok: false, message: added[0]!.message };
  return { ok: true, layout: next };
}

function baseline(names: NameEntry[], layout: CrosswordLayout): Set<string> {
  return new Set(validateLayout(names, layout).map(issueKey));
}

// Every name end where a manual decoration would be valid, in placement order (start before end).
export function eligibleDecorationSpots(names: NameEntry[], layout: CrosswordLayout): DecorationSpot[] {
  const before = baseline(names, layout);
  const spots: DecorationSpot[] = [];
  for (const p of layout.placements) {
    for (const end of ["start", "end"] as const) {
      const result = tryAdd(names, layout, p.nameId, end, before);
      if (result.ok) spots.push({ nameId: p.nameId, end, position: result.layout.decorativeTiles.at(-1)!.position });
    }
  }
  return spots;
}

// Returns a new layout with a blank manual tile at that name end, or the reason it is not allowed.
export function addDecoration(names: NameEntry[], layout: CrosswordLayout, anchor: { nameId: string; end: DecorationEnd }): AddDecorationResult {
  if (anchor.end !== "start" && anchor.end !== "end") return { ok: false, message: "A decoration goes at the start or end of a name." };
  return tryAdd(names, layout, anchor.nameId, anchor.end, baseline(names, layout));
}

// Removes a manual tile; automatic connectors and unknown ids leave the layout unchanged.
export function removeDecorativeTile(layout: CrosswordLayout, tileId: string): CrosswordLayout {
  const index = layout.decorativeTiles.findIndex((t) => t.id === tileId && t.source === "manual");
  if (index < 0) return layout;
  return { ...layout, decorativeTiles: layout.decorativeTiles.filter((_, i) => i !== index) };
}
