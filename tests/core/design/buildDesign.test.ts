import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDesign, exportDesign, operationColours } from "../../../src/core/design/buildDesign.ts";
import type { Design, DesignFonts } from "../../../src/core/design/buildDesign.ts";
import { buildFrameGeometry } from "../../../src/core/geometry/frame.ts";
import { buildCrosswordGeometry } from "../../../src/core/geometry/crossword.ts";
import type { FontOutliner } from "../../../src/core/geometry/types.ts";
import { checkFit, gridOriginMm, openingForSolver } from "../../../src/core/solver/index.ts";
import { exportBackerSvg, exportCrosswordSvg, exportFrameSvg } from "../../../src/core/export/index.ts";
import { DEFAULT_OPERATION_COLOURS } from "../../../src/core/export/index.ts";
import { newProject, withCurrentDefaults } from "../../../src/core/models/defaults.ts";
import { validateProject } from "../../../src/core/models/validation.ts";
import type { NameArtProject } from "../../../src/core/models/project.ts";
import { nameFont, yearFont } from "../geometry/helpers.ts";
import { solved } from "../export/fixtures.ts";
import { inGroup, parseSvg } from "../export/svgParse.ts";
import { signedArea } from "../../../src/core/geometry/polygonOps.ts";

const fonts: DesignFonts = { name: nameFont, year: yearFont, tile: yearFont };

function project(over: Partial<NameArtProject> = {}): NameArtProject {
  return {
    ...newProject(),
    projectName: "The Sanders",
    familyName: "The Sanders",
    year: "2026",
    names: solved.names,
    selectedLayout: solved.layout,
    ...over,
  };
}

function withSettings(p: NameArtProject, patch: Partial<NameArtProject["settings"]>): NameArtProject {
  return { ...p, settings: { ...p.settings, ...patch } };
}

const codes = (d: Design) => d.exportBlockers.map((b) => b.code);
const base = project();
const design = buildDesign({ project: base, fonts });

test("buildDesign gives the same frame, crossword and fit as calling the builders directly", () => {
  const s = base.settings;
  const frame = buildFrameGeometry({ familyName: base.familyName, year: base.year, settings: s.frame, nameFont, yearFont });
  const originMm = gridOriginMm(solved.layout, solved.names, frame.usableOpening.centroid, s.tileSizeMm);
  const crossword = buildCrosswordGeometry({
    names: solved.names,
    layout: solved.layout,
    tileSizeMm: s.tileSizeMm,
    originMm,
    tileFont: yearFont,
    showScores: s.lettering.showScores,
    artwork: [],
    letterHeightRatio: s.lettering.letterHeightRatio,
  });
  const opening = openingForSolver(frame.usableOpening, s.tileSizeMm, s.frame.crosswordClearanceMm);
  assert.deepEqual(design.frame, frame);
  assert.deepEqual(design.crossword, crossword);
  assert.deepEqual(design.originMm, originMm);
  assert.deepEqual(design.fit, checkFit(solved.layout, solved.names, opening));
  assert.deepEqual(design.exportBlockers, []);
  assert.equal(design.needsFitConfirmation, !design.fit!.fits);
});

test("exportDesign output is byte-identical to the three exporters on the preview geometry", () => {
  const result = exportDesign(design, operationColours(base.settings.export));
  assert.ok(result.ok);
  assert.deepEqual(
    result.files.map((f) => f.fileName),
    ["crossword.svg", "frame.svg", "backer.svg"],
  );
  assert.equal(result.files[0]!.svg, exportCrosswordSvg(design.crossword!).svg);
  assert.equal(result.files[1]!.svg, exportFrameSvg(design.frame!).svg);
  assert.equal(result.files[2]!.svg, exportBackerSvg(design.frame!, undefined, design.backerMark).svg);
});

test("rebuilding the same project gives identical files", () => {
  const a = exportDesign(design, {});
  const b = exportDesign(buildDesign({ project: project(), fonts }), {});
  assert.ok(a.ok && b.ok);
  assert.deepEqual(
    a.files.map((f) => f.svg),
    b.files.map((f) => f.svg),
  );
});

test("colours from the project settings reach the files", () => {
  const colours = { ...base.settings.export, cutColour: "#00FF00", scoreColour: "#ff00ff", engraveColour: "#123456" };
  const p = withSettings(base, { export: colours });
  const result = exportDesign(buildDesign({ project: p, fonts }), operationColours(p.settings.export));
  assert.ok(result.ok);
  const [crossword, frame, backer] = result.files.map((f) => f.svg);
  for (const svg of [crossword!, frame!, backer!]) assert.ok(svg.includes('stroke="#00FF00"'));
  assert.ok(crossword!.includes('stroke="#FF00FF"'));
  assert.ok(crossword!.includes('fill="#123456"') && frame!.includes('fill="#123456"'));
  for (const svg of [crossword!, frame!, backer!]) {
    for (const c of Object.values(DEFAULT_OPERATION_COLOURS)) assert.ok(!svg.includes(`"${c}"`), c);
  }
});

test("no chosen arrangement blocks export", () => {
  const { selectedLayout: _, ...rest } = base;
  const d = buildDesign({ project: rest as NameArtProject, fonts });
  assert.deepEqual(codes(d), ["no-layout"]);
  assert.equal(d.crossword, null);
  assert.equal(d.needsFitConfirmation, false);
  const r = exportDesign(d, {});
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.blockers[0]!.code === "no-layout");
});

test("a layout that no longer matches the names blocks export", () => {
  const names = solved.names.map((n, i) => (i === 0 ? { ...n, text: "ZZZZZZZ" } : n));
  const d = buildDesign({ project: project({ names }), fonts });
  assert.deepEqual(codes(d), ["layout-invalid"]);
  assert.ok(d.layoutIssues.some((i) => i.severity === "error"));
  assert.equal(d.crossword, null);
  assert.equal(exportDesign(d, {}).ok, false);
});

test("a character the tile font cannot draw blocks export", () => {
  const tile: FontOutliner = {
    id: "no-s",
    hasGlyphs: (s) => !s.includes("S") && yearFont.hasGlyphs(s),
    outline: (s, size) => {
      if (s.includes("S")) throw new Error("no S");
      return yearFont.outline(s, size);
    },
  };
  const d = buildDesign({ project: base, fonts: { ...fonts, tile } });
  assert.ok(codes(d).includes("crossword-problem"));
  assert.ok(d.exportBlockers.some((b) => b.message.includes("S")));
  assert.equal(exportDesign(d, {}).ok, false);
});

test("a family name the name font cannot draw blocks export", () => {
  const d = buildDesign({ project: project({ familyName: "日本" }), fonts });
  assert.deepEqual(codes(d), ["frame-unusable"]);
});

test("a frame with no opening blocks export", () => {
  const p = project({ familyName: "M" });
  const d = buildDesign({
    project: withSettings(p, { frame: { ...p.settings.frame, outerDiameterMm: 100, nameBufferMm: 50 } }),
    fonts,
  });
  assert.ok(d.frame!.warnings.some((w) => w.code === "no-opening"));
  assert.ok(codes(d).includes("frame-unusable"));
  assert.equal(exportDesign(d, {}).ok, false);
});

test("frame warnings that still give a cuttable frame do not block export", () => {
  const p = project();
  const d = buildDesign({ project: withSettings(p, { frame: { ...p.settings.frame, nameDropMm: 30 } }), fonts });
  assert.ok(d.frame!.warnings.some((w) => w.code === "name-outside-frame"));
  assert.ok(!codes(d).includes("frame-unusable"));
});

test("a crossword with tiles outside the frame needs confirmation but is not blocked", () => {
  const d = buildDesign({ project: withSettings(base, { tileSizeMm: 60 }), fonts });
  assert.ok(d.fit && !d.fit.fits && d.fit.tilesOutside.length > 0);
  assert.equal(d.needsFitConfirmation, true);
  assert.deepEqual(d.exportBlockers, []);
  assert.ok(exportDesign(d, {}).ok);
});

test("a project saved before export colours existed gets the defaults and still validates", () => {
  const old = project({ id: "p1" });
  const { export: _, ...settings } = old.settings;
  const legacy = { ...old, settings } as unknown as NameArtProject;
  assert.deepEqual(validateProject(legacy), []);
  const upgraded = withCurrentDefaults(legacy);
  assert.deepEqual(upgraded.settings.export, { cutColour: "#FF0000", scoreColour: "#0000FF", engraveColour: "#000000", backerMarkInsetMm: 1 });
  assert.deepEqual(operationColours(upgraded.settings.export), DEFAULT_OPERATION_COLOURS);
  assert.deepEqual(validateProject(upgraded), []);
});

test("validation refuses export colours that are not #RRGGBB", () => {
  for (const bad of ["#F00", "red", "#GG0000", "FF0000", "#FF00001", " #FF0000", 16711680, null]) {
    const p = withSettings(base, { export: { ...base.settings.export, scoreColour: bad as string } });
    assert.deepEqual(
      validateProject(p).map((i) => i.field),
      ["settings.export.scoreColour"],
      String(bad),
    );
  }
  assert.deepEqual(
    validateProject(withSettings(base, { export: "red" as unknown as NameArtProject["settings"]["export"] })).map((i) => i.field),
    ["settings.export"],
  );
  assert.deepEqual(validateProject(withSettings(base, { export: { cutColour: "#abcdef", scoreColour: "#ABCDEF", engraveColour: "#000000", backerMarkInsetMm: 1 } })), []);
});

const withInset = (inset: number) => withSettings(base, { export: { ...base.settings.export, backerMarkInsetMm: inset } });

test("backer.svg carries the crossword placement mark as closed score paths beside the cut circle", () => {
  const d = buildDesign({ project: withInset(1), fonts });
  assert.ok(d.backerMark.length >= 1);
  const result = exportDesign(d, { score: "#3CB44B" });
  assert.ok(result.ok);
  const svg = parseSvg(result.files[2]!.svg);
  const score = inGroup(svg, "score");
  assert.equal(score.length, d.backerMark.length);
  for (const el of score) {
    assert.equal(el.tag, "path");
    assert.equal(el.attrs.stroke, "#3CB44B");
    assert.ok(el.attrs.d!.endsWith("Z"));
  }
  assert.deepEqual(inGroup(svg, "cut").map((e) => e.tag), ["circle"]);
});

test("the mark sits where the crossword sits: same coordinates as the cut, inset by the setting", () => {
  const d = buildDesign({ project: withInset(1), fonts });
  const outer = d.crossword!.cut.outer;
  const mark = d.backerMark.find((r) => signedArea(r) > 0)!;
  const b = (ring: { x: number; y: number }[]) => ({
    minX: Math.min(...ring.map((p) => p.x)),
    maxX: Math.max(...ring.map((p) => p.x)),
  });
  assert.ok(Math.abs(b(mark).minX - (b(outer).minX + 1)) < 0.01);
  assert.ok(Math.abs(b(mark).maxX - (b(outer).maxX - 1)) < 0.01);
});

test("a changed inset changes the mark; crossword.svg and frame.svg do not change", () => {
  const a = buildDesign({ project: withInset(0.5), fonts });
  const b = buildDesign({ project: withInset(1.5), fonts });
  const ra = exportDesign(a, {});
  const rb = exportDesign(b, {});
  assert.ok(ra.ok && rb.ok);
  assert.notEqual(ra.files[2]!.svg, rb.files[2]!.svg);
  assert.equal(ra.files[0]!.svg, rb.files[0]!.svg);
  assert.equal(ra.files[1]!.svg, rb.files[1]!.svg);
  assert.equal(inGroup(parseSvg(ra.files[0]!.svg), "score").length, inGroup(parseSvg(exportCrosswordSvg(a.crossword!).svg), "score").length);
});

test("an inset too large for the crossword blocks export with a clear message and draws no mark", () => {
  const small = buildDesign({ project: withSettings(withInset(2), { tileSizeMm: 3 }), fonts });
  assert.ok(codes(small).includes("backer-mark-problem"));
  assert.deepEqual(small.backerMark, []);
  const r = exportDesign(small, {});
  assert.equal(r.ok, false);
  assert.ok(small.exportBlockers.some((b) => b.message === "Backer mark inset is too large for this crossword; reduce it."));
});

test("no crossword means no mark and no mark problem", () => {
  const { selectedLayout: _l, ...rest } = base;
  const d = buildDesign({ project: rest as NameArtProject, fonts });
  assert.deepEqual(d.backerMark, []);
  assert.ok(!codes(d).includes("backer-mark-problem"));
});

test("validation accepts 0.1 to 2 mm for the inset and refuses the rest with a field message", () => {
  for (const ok of [0.1, 1, 2]) assert.deepEqual(validateProject(withInset(ok)), [], String(ok));
  for (const bad of [0, 0.05, 2.1, -1, NaN, Infinity, "1"]) {
    assert.deepEqual(
      validateProject(withInset(bad as number)).map((i) => i.field),
      ["settings.export.backerMarkInsetMm"],
      String(bad),
    );
  }
});

test("a project saved without the inset opens with 1 mm and keeps its colours", () => {
  const old = withSettings(base, { export: { cutColour: "#112233", scoreColour: "#445566", engraveColour: "#778899" } as never });
  assert.deepEqual(validateProject(old), []);
  const upgraded = withCurrentDefaults(old);
  assert.equal(upgraded.settings.export.backerMarkInsetMm, 1);
  assert.equal(upgraded.settings.export.cutColour, "#112233");
});
