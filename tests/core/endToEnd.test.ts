// AC30: SPEC §26 steps 2–17 end to end with the real modules (no browser, no network port).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteProjectRepository } from "../../server/database/projectRepository.ts";
import { addArtwork, setTileArtwork } from "../../src/core/artwork/projectArtwork.ts";
import { convertSvg } from "../../src/core/artwork/convertSvg.ts";
import type { SvgNode } from "../../src/core/artwork/convertSvg.ts";
import { buildDesign, buildFramePart, exportDesign, operationColours } from "../../src/core/design/buildDesign.ts";
import type { Design, DesignFonts } from "../../src/core/design/buildDesign.ts";
import type { ExportedFile } from "../../src/core/export/svgExport.ts";
import { makeProjectFile } from "../../src/core/models/projectImport.ts";
import { parseProjectImport } from "../../src/core/models/projectImport.ts";
import { DEFAULT_SOLVER_WEIGHTS, newProject, withCurrentDefaults } from "../../src/core/models/defaults.ts";
import type { NameArtProject } from "../../src/core/models/project.ts";
import { validateProject } from "../../src/core/models/validation.ts";
import { centredLayout, largestTileSizeThatFits, movedLayout } from "../../src/core/sizing/index.ts";
import { addDecoration, eligibleDecorationSpots, openingForSolver, solve, validateLayout } from "../../src/core/solver/index.ts";
import { nameFont, yearFont } from "./geometry/helpers.ts";

const fonts: DesignFonts = { name: nameFont, year: yearFont, tile: yearFont };
const colours = { cutColour: "#E6194B", scoreColour: "#3CB44B", engraveColour: "#112233" };

const NAMES = ["Anna", "Michael", "José", "Ella", "Oliver", "Sam", "Zuzu"];

const smallArt: SvgNode = {
  tag: "svg",
  attrs: { viewBox: "0 0 20 20" },
  children: [
    { tag: "rect", attrs: { x: "2", y: "2", width: "16", height: "16", fill: "#000" }, children: [] },
    { tag: "circle", attrs: { cx: "10", cy: "10", r: "4", fill: "#000" }, children: [] },
  ],
};

const exportFiles = (p: NameArtProject): ExportedFile[] => {
  const result = exportDesign(buildDesign({ project: p, fonts }), operationColours(p.settings.export));
  assert.ok(result.ok, result.ok ? "" : result.blockers.map((b) => b.message).join("; "));
  return result.ok ? result.files : [];
};

const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;

test("SPEC §26 workflow: create, generate, choose, decorate, export, save, reopen, export again", async (t) => {
  let project: NameArtProject = newProject();
  let files: ExportedFile[] = [];
  let design: Design;

  await t.test("steps 2-3: create a project with names", () => {
    project = {
      ...project,
      projectName: "Sanders family",
      customerName: "Mike Sanders",
      familyName: "The Sanders",
      year: "2026",
      names: NAMES.map((text, i) => ({ id: `n${i}`, text })),
    };
    assert.deepEqual(validateProject(project), []);
  });

  await t.test("step 4: pick a diameter, tile size and colours", () => {
    project = {
      ...project,
      settings: {
        ...project.settings,
        tileSizeMm: 11,
        frame: { ...project.settings.frame, outerDiameterMm: 340 },
        export: colours,
      },
    };
    assert.deepEqual(validateProject(project), []);
  });

  await t.test("steps 5-7: generate candidates with scores and choose one", () => {
    const { frame } = buildFramePart(project, fonts);
    assert.ok(frame);
    const opening = openingForSolver(frame.usableOpening, project.settings.tileSizeMm, project.settings.frame.crosswordClearanceMm);
    const result = solve({
      names: project.names,
      settings: { seed: 7, searchMode: "balanced", weights: { ...DEFAULT_SOLVER_WEIGHTS } },
      opening,
    });
    assert.equal(result.failure, undefined);
    assert.ok(result.layouts.length >= 2, "several candidates");
    for (const c of result.layouts) {
      assert.deepEqual(validateLayout(project.names, c.layout).filter((i) => i.severity === "error"), []);
      assert.ok(Number.isFinite(c.score.total));
      assert.deepEqual(Object.keys(c.score.breakdown).sort(), Object.keys(DEFAULT_SOLVER_WEIGHTS).sort());
    }
    const chosen = result.layouts.find((c) => c.connectorCount >= 1);
    assert.ok(chosen, "a candidate with an automatic connector");
    project = { ...project, selectedLayout: chosen.layout };
    assert.ok(project.selectedLayout!.decorativeTiles.some((d) => d.source === "automatic" && d.purpose === "connector"));
  });

  await t.test("steps 8-9: add a decorative tile and set pictures", () => {
    let layout = project.selectedLayout!;
    const spots = eligibleDecorationSpots(project.names, layout);
    assert.ok(spots.length > 0, "a spot for a decorative end tile");
    const added = addDecoration(project.names, layout, { nameId: spots[0]!.nameId, end: spots[0]!.end });
    assert.ok(added.ok);
    layout = added.ok ? added.layout : layout;
    const manual = layout.decorativeTiles.filter((d) => d.source === "manual" && d.purpose === "decoration");
    assert.equal(manual.length, 1);

    const converted = convertSvg(smallArt, "Badge");
    assert.ok(converted.ok);
    if (!converted.ok) return;
    const withArt = addArtwork({ ...project, selectedLayout: layout }, converted.asset);
    assert.ok(withArt.ok);
    if (!withArt.ok) return;
    const tiles = layout.decorativeTiles;
    layout = setTileArtwork(layout, manual[0]!.id, "builtin:star");
    const other = tiles.find((d) => d.id !== manual[0]!.id);
    assert.ok(other, "a second tile to hold the uploaded picture");
    layout = setTileArtwork(layout, other.id, withArt.artworkId);
    project = { ...withArt.project, selectedLayout: layout };
    assert.equal(layout.decorativeTiles.find((d) => d.id === manual[0]!.id)!.artworkId, "builtin:star");
    assert.equal(layout.decorativeTiles.find((d) => d.id === other.id)!.artworkId, withArt.artworkId);
    assert.deepEqual(validateProject(project), []);
  });

  await t.test("steps 10-13: build the design, fix the fit, move and centre", () => {
    design = buildDesign({ project, fonts });
    if (design.fit && !design.fit.fits) {
      assert.ok(design.needsFitConfirmation);
      const size = largestTileSizeThatFits({
        names: project.names,
        layout: project.selectedLayout!,
        opening: design.frame!.usableOpening,
        clearanceMm: project.settings.frame.crosswordClearanceMm,
        min: 3,
        max: project.settings.tileSizeMm,
      });
      assert.ok(size !== null && size < project.settings.tileSizeMm);
      project = { ...project, settings: { ...project.settings, tileSizeMm: size } };
      design = buildDesign({ project, fonts });
      assert.ok(design.fit?.fits, "fits after the explicit tile size action");
    }
    assert.deepEqual(design.exportBlockers, []);
    assert.equal(design.fit?.fits, true);
    assert.ok(design.frame && design.crossword);
    assert.ok(design.frame.innerCut.length >= 3, "one inner cut ring");
    assert.ok(design.frame.engraving.name.length > 0 && design.frame.engraving.year.length > 0);
    assert.ok(design.crossword.cut.outer.length >= 3, "one outer ring");

    const moved = movedLayout(project.selectedLayout!, 2, -1.5);
    assert.deepEqual(moved.offset, { xMm: 2, yMm: -1.5 });
    const movedDesign = buildDesign({ project: { ...project, selectedLayout: moved }, fonts });
    assert.notDeepEqual(movedDesign.crossword!.cut.outer[0], design.crossword.cut.outer[0]);
    assert.deepEqual(centredLayout(moved).offset, { xMm: 0, yMm: 0 });

    // Step 13: an oversized tile no longer fits; the explicit action finds the largest that does.
    const oversized = { ...project, settings: { ...project.settings, tileSizeMm: 30 } };
    const tooBig = buildDesign({ project: oversized, fonts });
    assert.equal(tooBig.fit?.fits, false);
    assert.ok(tooBig.needsFitConfirmation);
    const fixed = largestTileSizeThatFits({
      names: project.names,
      layout: project.selectedLayout!,
      opening: tooBig.frame!.usableOpening,
      clearanceMm: project.settings.frame.crosswordClearanceMm,
      min: 3,
      max: 30,
    });
    assert.ok(fixed !== null && fixed < 30);
    const refit = buildDesign({ project: { ...project, settings: { ...project.settings, tileSizeMm: fixed } }, fonts });
    assert.equal(refit.fit?.fits, true);
    assert.deepEqual(refit.exportBlockers, []);
  });

  await t.test("step 12: changing a parameter rebuilds with different geometry", () => {
    const base = buildDesign({ project, fonts });
    const wider = buildDesign({
      project: { ...project, settings: { ...project.settings, frame: { ...project.settings.frame, ringWidthMm: 11, nameBufferMm: 4 } } },
      fonts,
    });
    assert.notDeepEqual(wider.frame!.innerCut, base.frame!.innerCut);
    assert.ok(wider.frame!.usableOpening.areaMm2 < base.frame!.usableOpening.areaMm2);
    const smaller = buildDesign({ project: { ...project, settings: { ...project.settings, tileSizeMm: project.settings.tileSizeMm - 1 } }, fonts });
    assert.ok(smaller.crossword!.tileSizeMm < base.crossword!.tileSizeMm);
    assert.notDeepEqual(smaller.crossword!.cut.outer, base.crossword!.cut.outer);
  });

  await t.test("step 14-15: export the three SVGs", () => {
    files = exportFiles(project);
    assert.deepEqual(files.map((f) => f.fileName), ["crossword.svg", "frame.svg", "backer.svg"]);
    for (const f of files) {
      assert.ok(!f.isEmpty);
      const w = `${f.widthMm}mm`;
      assert.ok(f.svg.includes(`width="${w}" height="${f.heightMm}mm" viewBox="0 0 ${f.widthMm} ${f.heightMm}"`), f.fileName);
      assert.ok(!/<text|<image|<script|href/i.test(f.svg), `${f.fileName} has only plain vector content`);
    }
    const [crossword, frame, backer] = files as [ExportedFile, ExportedFile, ExportedFile];
    // Frame: 340 mm outer circle plus 1 mm margins; backer is the same size.
    assert.equal(frame.widthMm, 342);
    assert.equal(backer.widthMm, 342);
    assert.ok(crossword.widthMm < frame.widthMm);
    assert.ok(frame.svg.includes('<g id="engrave"') && frame.svg.includes('<g id="cut"'));
    assert.ok(frame.svg.includes(`fill="${colours.engraveColour}"`) && frame.svg.includes(`stroke="${colours.cutColour}"`));
    assert.equal(count(frame.svg, /<circle /g), 1, "frame outer edge is a circle");
    assert.equal(count(backer.svg, /<circle /g), 1, "backer is one circle");
    assert.ok(!backer.svg.includes("<path"));
    assert.ok(crossword.svg.includes('<g id="engrave"') && crossword.svg.includes('<g id="score"') && crossword.svg.includes('<g id="cut"'));
    assert.ok(crossword.svg.includes(`stroke="${colours.scoreColour}"`));
    assert.ok(crossword.svg.includes(`stroke="${colours.cutColour}"`));
    assert.ok(crossword.svg.includes(`fill="${colours.engraveColour}"`));
  });

  await t.test("steps 16-17: save to SQLite, reopen, and export identical files", () => {
    const dir = mkdtempSync(join(tmpdir(), "crossword-e2e-"));
    const repo = new SqliteProjectRepository(join(dir, "nested", "projects.sqlite"));
    try {
      const record = repo.create(project);
      const listed = repo.list();
      assert.equal(listed.length, 1);
      assert.equal(listed[0]!.projectName, "Sanders family");
      assert.equal(listed[0]!.customerName, "Mike Sanders");

      const reopened = withCurrentDefaults(repo.get(record.id)!.project);
      assert.deepEqual(reopened, { ...project, id: record.id });
      const again = exportFiles(reopened);
      assert.deepEqual(again.map((f) => f.svg), files.map((f) => f.svg), "byte-identical after reopening");
    } finally {
      repo.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await t.test("JSON project file round-trip builds the same files", () => {
    const text = JSON.stringify(makeProjectFile(project, new Date("2026-01-01T00:00:00Z")));
    const imported = parseProjectImport(text);
    assert.ok(imported.ok, imported.ok ? "" : imported.messages.join("; "));
    if (!imported.ok) return;
    assert.equal(imported.project.id, "");
    assert.deepEqual(exportFiles(imported.project).map((f) => f.svg), files.map((f) => f.svg));
  });
});
