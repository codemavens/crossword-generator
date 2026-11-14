import type { CrosswordLayout, DesignSettings, FrameSettings, NameArtProject, SolverWeights } from "./project.ts";

export const CURRENT_SCHEMA_VERSION = 1;

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

export function defaultDesignSettings(): DesignSettings {
  return {
    tileSizeMm: 12.7,
    frame: defaultFrameSettings(),
    lettering: { tileFontId: "default", showScores: true },
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
  const upgraded: NameArtProject = { ...project, settings: { ...project.settings, frame } };
  if (project.selectedLayout) upgraded.selectedLayout = upgradeLayout(project.selectedLayout);
  return upgraded;
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
