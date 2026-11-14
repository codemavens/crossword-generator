// Pure project edits for tile artwork (CHG-0007 AC3, AC11).
import type { ArtworkAsset, CrosswordLayout, NameArtProject } from "../models/project.ts";
import { MAX_CUSTOM_ARTWORK } from "./constants.ts";

// Next free "art-N" id; deterministic so tests and saves are stable.
export function newArtworkId(existing: readonly ArtworkAsset[]): string {
  const used = new Set(existing.map((a) => a.id));
  let k = 1;
  while (used.has(`art-${k}`)) k++;
  return `art-${k}`;
}

export type AddArtworkResult = { ok: true; project: NameArtProject; artworkId: string } | { ok: false; message: string };

// Stores a converted upload under a new id; refused once the project holds the maximum.
export function addArtwork(project: NameArtProject, asset: Omit<ArtworkAsset, "id">): AddArtworkResult {
  if (project.artwork.length >= MAX_CUSTOM_ARTWORK) {
    return { ok: false, message: `A project can hold at most ${MAX_CUSTOM_ARTWORK} uploaded pictures. Delete one first.` };
  }
  const artworkId = newArtworkId(project.artwork);
  const stored: ArtworkAsset = { id: artworkId, name: asset.name, source: "custom", shapes: asset.shapes, bounds: asset.bounds };
  return { ok: true, project: { ...project, artwork: [...project.artwork, stored] }, artworkId };
}

// Changes one tile's picture only; an unknown tile id leaves the layout unchanged.
export function setTileArtwork(layout: CrosswordLayout, tileId: string, artworkId: string | null): CrosswordLayout {
  if (!layout.decorativeTiles.some((t) => t.id === tileId)) return layout;
  return { ...layout, decorativeTiles: layout.decorativeTiles.map((t) => (t.id === tileId ? { ...t, artworkId } : t)) };
}

// Deletes an uploaded picture; tiles that used it become blank.
export function removeArtwork(project: NameArtProject, artworkId: string): NameArtProject {
  if (!project.artwork.some((a) => a.id === artworkId)) return project;
  const next: NameArtProject = { ...project, artwork: project.artwork.filter((a) => a.id !== artworkId) };
  const layout = project.selectedLayout;
  if (layout && layout.decorativeTiles.some((t) => t.artworkId === artworkId)) {
    next.selectedLayout = {
      ...layout,
      decorativeTiles: layout.decorativeTiles.map((t) => (t.artworkId === artworkId ? { ...t, artworkId: null } : t)),
    };
  }
  return next;
}
