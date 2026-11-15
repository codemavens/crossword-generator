import type { ArtworkAsset, CrosswordLayout, DesignSettings, FrameSettings, LetteringSettings, NameArtProject, SolverWeights } from "./project.ts";
import { DEFAULT_ARTWORK_ID, MAX_CUSTOM_ARTWORK, isBuiltinArtworkId } from "../artwork/constants.ts";
import { artworkAssetProblem } from "../artwork/validateAsset.ts";

// 2: tile artwork (CHG-0007). Version 1 projects had no picture choice, so their blank tiles mean "default".
export const CURRENT_SCHEMA_VERSION = 2;
export const ARTWORK_SCHEMA_VERSION = 2;

export const DEFAULT_SOLVER_WEIGHTS: SolverWeights = {
  circularFit: 25,
  compactness: 20,
  visualBalance: 35,
  naturalIntersections: 40,
  fewConnectors: 45,
};

// Frame and font values are placeholders until physical testing (SPEC §24).
export function defaultFrameSettings(): FrameSettings {
  return {
    outerDiameterMm: 300,
    ringWidthMm: 8,
    familyNameFontId: "pacifico",
    familyNameFontSizeMm: 20,
    yearFontId: "zilla-slab-semibold",
    yearFontSizeMm: 14,
    nameBufferMm: 2.5,
    contourSmoothness: 0.2,
    bottomLineHeightMm: 26,
    nameDropMm: 5,
    bottomCornerRadiusMm: 12,
    crosswordClearanceMm: 5,
  };
}

// Approved default tile font (CHG-0008); older projects stored "default" for it.
export const DEFAULT_TILE_FONT_ID = "zilla-slab-semibold";

export function defaultLetteringSettings(): LetteringSettings {
  return { tileFontId: DEFAULT_TILE_FONT_ID, showScores: true };
}

export function defaultDesignSettings(): DesignSettings {
  return {
    tileSizeMm: 12.7,
    frame: defaultFrameSettings(),
    lettering: defaultLetteringSettings(),
    solver: { seed: 1, searchMode: "balanced", weights: { ...DEFAULT_SOLVER_WEIGHTS } },
  };
}

// Projects saved before CHG-0005 stored `connectors`; entries without an anchor cannot be kept.
function upgradeLayout(layout: CrosswordLayout): CrosswordLayout {
  const legacy = layout as CrosswordLayout & { connectors?: unknown };
  if (Array.isArray(layout.decorativeTiles) && legacy.connectors === undefined) return layout;
  const { connectors, ...rest } = legacy;
  const source = Array.isArray(layout.decorativeTiles) ? layout.decorativeTiles : Array.isArray(connectors) ? connectors : [];
  const decorativeTiles = (source as CrosswordLayout["decorativeTiles"]).filter(
    (t) => typeof t === "object" && t !== null && typeof t.anchor === "object" && t.anchor !== null,
  );
  return { ...rest, decorativeTiles };
}

// Fills settings added after a project was saved, and replaces font ids that no longer exist.
export function withCurrentDefaults(project: NameArtProject): NameArtProject {
  const defaults = defaultFrameSettings();
  const frame: FrameSettings = { ...defaults, ...project.settings.frame };
  if (frame.familyNameFontId === "default") frame.familyNameFontId = defaults.familyNameFontId;
  const lettering: LetteringSettings = { ...defaultLetteringSettings(), ...project.settings.lettering };
  if (lettering.tileFontId === "default") lettering.tileFontId = DEFAULT_TILE_FONT_ID;
  const artwork = upgradeArtwork(project.artwork);
  const upgraded: NameArtProject = {
    ...project,
    schemaVersion: Math.max(CURRENT_SCHEMA_VERSION, Number.isInteger(project.schemaVersion) ? project.schemaVersion : 0),
    artwork,
    settings: { ...project.settings, frame, lettering },
  };
  if (project.selectedLayout) {
    const legacy = !(Number.isInteger(project.schemaVersion) && project.schemaVersion >= ARTWORK_SCHEMA_VERSION);
    upgraded.selectedLayout = upgradeTileArtwork(upgradeLayout(project.selectedLayout), artwork, legacy);
  }
  return upgraded;
}

// Keeps only uploads in the stored form; older entries (e.g. raw `svg` strings) are dropped.
function upgradeArtwork(list: unknown): ArtworkAsset[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const kept: ArtworkAsset[] = [];
  for (const a of list) {
    if (artworkAssetProblem(a) !== null) continue;
    const asset = a as ArtworkAsset;
    if (seen.has(asset.id) || kept.length >= MAX_CUSTOM_ARTWORK) continue;
    seen.add(asset.id);
    kept.push(asset);
  }
  return kept;
}

// Blank tiles in a pre-artwork project get the default picture; ids that no longer resolve fall back the same way.
function upgradeTileArtwork(layout: CrosswordLayout, artwork: readonly ArtworkAsset[], legacy: boolean): CrosswordLayout {
  const known = new Set(artwork.map((a) => a.id));
  const fallback = legacy ? DEFAULT_ARTWORK_ID : null;
  let changed = false;
  const decorativeTiles = layout.decorativeTiles.map((t) => {
    const id = t.artworkId;
    const ok = id === null ? !legacy : isBuiltinArtworkId(id) || known.has(id);
    if (ok) return t;
    changed = true;
    return { ...t, artworkId: fallback };
  });
  return changed ? { ...layout, decorativeTiles } : layout;
}

// The id is assigned by the server on first save.
export function newProject(): NameArtProject {
  return {
    id: "",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectName: "",
    familyName: "",
    names: [],
    artwork: [],
    settings: defaultDesignSettings(),
  };
}
