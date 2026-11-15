import { test } from "node:test";
import assert from "node:assert/strict";
import { addArtwork, newArtworkId, removeArtwork, setTileArtwork } from "../../../src/core/artwork/projectArtwork.ts";
import { DEFAULT_ARTWORK_ID, MAX_CUSTOM_ARTWORK } from "../../../src/core/artwork/constants.ts";
import { CURRENT_SCHEMA_VERSION, newProject, withCurrentDefaults } from "../../../src/core/models/defaults.ts";
import { validateProject } from "../../../src/core/models/validation.ts";
import { addDecoration } from "../../../src/core/solver/index.ts";
import type { ArtworkAsset, CrosswordLayout, DecorativeTile, NameArtProject } from "../../../src/core/models/project.ts";

const SHAPE = { d: "M0 0L10 0L10 10Z", fillRule: "nonzero" as const };
const BOUNDS = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

function asset(id: string): ArtworkAsset {
  return { id, name: `Pic ${id}`, source: "custom", shapes: [SHAPE], bounds: BOUNDS };
}

function tile(id: string, nameId: string, artworkId: string | null): DecorativeTile {
  return { id, position: { x: nameId === "1" ? 2 : 3, y: 0 }, artworkId, source: "manual", purpose: "decoration", anchor: { nameId, end: "end" } };
}

function project(tiles: DecorativeTile[], artwork: ArtworkAsset[] = []): NameArtProject {
  const layout: CrosswordLayout = {
    id: "layout-1",
    seed: 1,
    placements: [{ nameId: "1", start: { x: 0, y: 0 }, direction: "horizontal" }],
    decorativeTiles: tiles,
    offset: { xMm: 0, yMm: 0 },
  };
  return { ...newProject(), projectName: "Smith", names: [{ id: "1", text: "Al" }], artwork, selectedLayout: layout };
}

test("setTileArtwork changes only that tile and nothing else", () => {
  const p = project([tile("a", "1", DEFAULT_ARTWORK_ID), tile("b", "2", "builtin:star")]);
  const next = setTileArtwork(p.selectedLayout!, "a", "builtin:cow");
  assert.deepEqual(next.decorativeTiles.map((t) => t.artworkId), ["builtin:cow", "builtin:star"]);
  assert.deepEqual(next.decorativeTiles[0]!.position, p.selectedLayout!.decorativeTiles[0]!.position);
  assert.equal(next.decorativeTiles[1], p.selectedLayout!.decorativeTiles[1]);
  assert.deepEqual({ ...next, decorativeTiles: [] }, { ...p.selectedLayout!, decorativeTiles: [] });
  assert.equal(setTileArtwork(p.selectedLayout!, "a", null).decorativeTiles[0]!.artworkId, null);
  assert.equal(setTileArtwork(p.selectedLayout!, "missing", null), p.selectedLayout);
});

test("removeArtwork deletes the picture and blanks the tiles that used it", () => {
  const p = project([tile("a", "1", "art-1"), tile("b", "2", "art-2")], [asset("art-1"), asset("art-2")]);
  const next = removeArtwork(p, "art-1");
  assert.deepEqual(next.artwork.map((a) => a.id), ["art-2"]);
  assert.deepEqual(next.selectedLayout!.decorativeTiles.map((t) => t.artworkId), [null, "art-2"]);
  assert.deepEqual(p.artwork.length, 2, "input is not mutated");
  assert.equal(removeArtwork(p, "art-9"), p);
  assert.equal(removeArtwork(p, DEFAULT_ARTWORK_ID), p);
  const noLayout = removeArtwork({ ...p, selectedLayout: undefined } as NameArtProject, "art-2");
  assert.equal(noLayout.selectedLayout, undefined);
});

test("addArtwork assigns the next free id and enforces the per-project limit", () => {
  const p = project([], [asset("art-1"), asset("art-3")]);
  assert.equal(newArtworkId(p.artwork), "art-2");
  const { id: _, ...upload } = asset("ignored");
  const added = addArtwork(p, upload);
  assert.ok(added.ok);
  assert.equal(added.artworkId, "art-2");
  assert.equal(added.project.artwork.at(-1)!.id, "art-2");
  const full = project([], Array.from({ length: MAX_CUSTOM_ARTWORK }, (_, i) => asset(`art-${i + 1}`)));
  const refused = addArtwork(full, upload);
  assert.equal(refused.ok, false);
});

test("new manual tiles start with the default heart", () => {
  const names = [{ id: "1", text: "Al" }];
  const layout = { ...project([]).selectedLayout! };
  const added = addDecoration(names, layout, { nameId: "1", end: "end" });
  assert.ok(added.ok);
  assert.equal(added.layout.decorativeTiles[0]!.artworkId, DEFAULT_ARTWORK_ID);
});

test("a project saved before artwork existed opens with heart tiles and drops raw svg entries", () => {
  const old = project([tile("a", "1", null)]) as unknown as Record<string, unknown>;
  old.schemaVersion = 1;
  old.artwork = [{ id: "old", name: "Old", source: "custom", svg: "<svg onload='alert(1)'/>" }];
  const upgraded = withCurrentDefaults(old as unknown as NameArtProject);
  assert.equal(upgraded.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(upgraded.artwork, []);
  assert.equal(upgraded.selectedLayout!.decorativeTiles[0]!.artworkId, DEFAULT_ARTWORK_ID);
  assert.deepEqual(validateProject(upgraded), []);
});

test("a current project keeps a tile the user set to blank", () => {
  const current = project([tile("a", "1", null), tile("b", "2", "art-1")], [asset("art-1")]);
  assert.equal(current.schemaVersion, CURRENT_SCHEMA_VERSION);
  const upgraded = withCurrentDefaults(current);
  assert.deepEqual(upgraded.selectedLayout!.decorativeTiles.map((t) => t.artworkId), [null, "art-1"]);
  assert.deepEqual(upgraded.artwork, current.artwork);
});

test("tiles pointing at pictures that no longer exist become blank in a current project", () => {
  const current = project([tile("a", "1", "art-7"), tile("b", "2", "builtin:dragon")]);
  const upgraded = withCurrentDefaults(current);
  assert.deepEqual(upgraded.selectedLayout!.decorativeTiles.map((t) => t.artworkId), [null, null]);
});
