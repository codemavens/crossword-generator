// Real crossword geometry for export tests.
import { buildCrosswordGeometry } from "../../../src/core/geometry/crossword.ts";
import type { CrosswordGeometry, CrosswordInput } from "../../../src/core/geometry/crossword.ts";
import { addDecoration, eligibleDecorationSpots } from "../../../src/core/solver/index.ts";
import type { ArtworkAsset, CrosswordLayout, NamePlacement } from "../../../src/core/models/project.ts";
import { yearFont } from "../geometry/helpers.ts";
import { entries, run, TEN_NAMES } from "../solver/helpers.ts";

export function layoutOf(placements: NamePlacement[]): CrosswordLayout {
  return { id: "t", seed: 0, placements, decorativeTiles: [], offset: { xMm: 0, yMm: 0 } };
}

export function build(over: Partial<CrosswordInput> & Pick<CrosswordInput, "names" | "layout">): CrosswordGeometry {
  return buildCrosswordGeometry({
    tileSizeMm: 12.7,
    originMm: { x: -60, y: -40 },
    tileFont: yearFont,
    showScores: true,
    artwork: [],
    ...over,
  });
}

export const solved = (() => {
  const { names, result } = run(TEN_NAMES);
  return { names, layout: result.layouts[0]!.layout };
})();

// A 3×3 ring of four names around the empty square (1, 1).
export const loop = {
  names: entries(["ABC", "ADE", "CFG", "EHG"]),
  layout: layoutOf([
    { nameId: "n0", start: { x: 0, y: 0 }, direction: "horizontal" },
    { nameId: "n1", start: { x: 0, y: 0 }, direction: "vertical" },
    { nameId: "n2", start: { x: 2, y: 0 }, direction: "vertical" },
    { nameId: "n3", start: { x: 0, y: 2 }, direction: "horizontal" },
  ]),
};

// Two overlapping squares plus an even-odd ring, to exercise artwork normalisation.
export const overlappingArt: ArtworkAsset = {
  id: "up-overlap",
  name: "Overlap",
  source: "custom",
  shapes: [
    { d: "M0 0L6 0L6 6L0 6Z", fillRule: "nonzero" },
    { d: "M4 4L10 4L10 10L4 10Z", fillRule: "nonzero" },
    { d: "M0 7L3 7L3 10L0 10Z M1 8L2 8L2 9L1 9Z", fillRule: "evenodd" },
  ],
  bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
};

// The solved layout with decorative tiles: a built-in heart, the overlapping custom picture, and a star.
export function decorated(tileSizeMm = 12.7): CrosswordGeometry {
  let layout = solved.layout;
  for (const spot of eligibleDecorationSpots(solved.names, layout).slice(0, 3)) {
    const r = addDecoration(solved.names, layout, { nameId: spot.nameId, end: spot.end });
    if (r.ok) layout = r.layout;
  }
  const ids = ["builtin:heart", overlappingArt.id, "builtin:star"];
  const decorativeTiles = layout.decorativeTiles.map((d, i) => ({ ...d, artworkId: ids[i % ids.length]! }));
  return build({ names: solved.names, layout: { ...layout, decorativeTiles }, artwork: [overlappingArt], tileSizeMm });
}
