import type { DesignSettings, NameArtProject, SolverWeights } from "./project.ts";

export const CURRENT_SCHEMA_VERSION = 1;

export const DEFAULT_SOLVER_WEIGHTS: SolverWeights = {
  circularFit: 25,
  compactness: 20,
  visualBalance: 35,
  naturalIntersections: 40,
  fewConnectors: 45,
};

// Frame and font values are placeholders until physical testing (SPEC §24).
export function defaultDesignSettings(): DesignSettings {
  return {
    tileSizeMm: 12.7,
    frame: {
      outerDiameterMm: 300,
      ringWidthMm: 15,
      familyNameFontId: "default",
      familyNameFontSizeMm: 20,
      nameBufferMm: 3,
      contourSmoothness: 0.5,
    },
    lettering: { tileFontId: "default", showScores: true },
    solver: { seed: 1, searchMode: "balanced", weights: { ...DEFAULT_SOLVER_WEIGHTS } },
  };
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
