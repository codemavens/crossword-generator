// Where a picture sits in its tile (CHG-0007 AC9); shared by the preview and, later, the exporter.
import type { ArtworkBounds } from "../models/project.ts";
import { ARTWORK_MARGIN_RATIO } from "./constants.ts";

export interface ArtworkPlacement {
  scale: number;
  dx: number;
  dy: number;
}

// A picture point p maps to tile-local mm as p·scale + (dx, dy): centred, proportions kept, inside the margin.
export function artworkTransform(bounds: ArtworkBounds, tileSizeMm: number): ArtworkPlacement {
  const available = tileSizeMm * (1 - 2 * ARTWORK_MARGIN_RATIO);
  const extent = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  // A picture with no extent collapses to the tile centre rather than dividing by zero.
  const scale = extent > 0 && Number.isFinite(extent) ? available / extent : 0;
  return {
    scale,
    dx: tileSizeMm / 2 - (scale * (bounds.minX + bounds.maxX)) / 2,
    dy: tileSizeMm / 2 - (scale * (bounds.minY + bounds.maxY)) / 2,
  };
}
