// AC29: a project saved to SQLite and reopened gives the same design and the same export files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SqliteProjectRepository } from "../../../server/database/projectRepository.ts";
import { buildDesign, exportDesign, operationColours } from "../../../src/core/design/buildDesign.ts";
import type { DesignFonts } from "../../../src/core/design/buildDesign.ts";
import { newProject, withCurrentDefaults } from "../../../src/core/models/defaults.ts";
import { validateProject } from "../../../src/core/models/validation.ts";
import { addDecoration, eligibleDecorationSpots } from "../../../src/core/solver/index.ts";
import { nameFont, yearFont } from "../geometry/helpers.ts";
import { overlappingArt, solved } from "../export/fixtures.ts";

const fonts: DesignFonts = { name: yearFont, year: nameFont, tile: nameFont };

function savedProject() {
  let layout = solved.layout;
  for (const spot of eligibleDecorationSpots(solved.names, layout).slice(0, 3)) {
    const r = addDecoration(solved.names, layout, { nameId: spot.nameId, end: spot.end });
    if (r.ok) layout = r.layout;
  }
  const ids = ["builtin:heart", overlappingArt.id, null];
  layout = {
    ...layout,
    offset: { xMm: 4.5, yMm: -3 },
    decorativeTiles: layout.decorativeTiles.map((d, i) => ({ ...d, artworkId: ids[i % 3] ?? null })),
  };
  const base = newProject();
  return {
    ...base,
    projectName: "Reopen",
    customerName: "Ann",
    familyName: "The Sanders",
    year: "2026",
    names: solved.names,
    artwork: [overlappingArt],
    selectedLayout: layout,
    settings: {
      ...base.settings,
      tileSizeMm: 11.4,
      frame: { ...base.settings.frame, familyNameFontId: "zilla-slab-semibold", yearFontId: "pacifico", outerDiameterMm: 340 },
      lettering: { tileFontId: "pacifico", showScores: false, letterHeightRatio: 0.55 },
      export: { cutColour: "#FF00FF", scoreColour: "#00FFFF", engraveColour: "#112233" },
    },
  };
}

test("saving and reloading keeps the project and the exported files byte-identical", () => {
  const project = savedProject();
  assert.deepEqual(validateProject(project), []);
  const repo = new SqliteProjectRepository(":memory:");
  try {
    const record = repo.create(project);
    const reloaded = withCurrentDefaults(repo.get(record.id)!.project);
    assert.deepEqual(reloaded, { ...project, id: record.id });

    const files = (p: typeof project) => {
      const result = exportDesign(buildDesign({ project: p, fonts }), operationColours(p.settings.export));
      assert.ok(result.ok, "export should be allowed");
      return result.ok ? result.files : [];
    };
    const before = files({ ...project, id: record.id });
    const after = files(reloaded);
    assert.equal(before.length, 3);
    assert.deepEqual(after.map((f) => f.svg), before.map((f) => f.svg));
    assert.ok(before[0]!.svg.includes("#FF00FF"));
  } finally {
    repo.close();
  }
});
