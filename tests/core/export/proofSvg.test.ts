import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDesign } from "../../../src/core/design/buildDesign.ts";
import type { DesignFonts } from "../../../src/core/design/buildDesign.ts";
import { buildProofSvg, PROOF_COLOURS } from "../../../src/core/export/proofSvg.ts";
import { DEFAULT_OPERATION_COLOURS } from "../../../src/core/export/index.ts";
import { newProject } from "../../../src/core/models/defaults.ts";
import { addDecoration, eligibleDecorationSpots } from "../../../src/core/solver/index.ts";
import { nameFont, yearFont } from "../geometry/helpers.ts";
import { overlappingArt, solved } from "./fixtures.ts";

const fonts: DesignFonts = { name: nameFont, year: yearFont, tile: yearFont };
const base = { ...newProject(), projectName: "P", familyName: "The Sanders", year: "2026", names: solved.names };
const decorated = (() => {
  let layout = solved.layout;
  for (const spot of eligibleDecorationSpots(solved.names, layout).slice(0, 2)) {
    const r = addDecoration(solved.names, layout, { nameId: spot.nameId, end: spot.end });
    if (r.ok) layout = r.layout;
  }
  const ids = ["builtin:heart", overlappingArt.id];
  return { ...layout, decorativeTiles: layout.decorativeTiles.map((d, i) => ({ ...d, artworkId: ids[i % 2]! })) };
})();
const full = buildDesign({ project: { ...base, artwork: [overlappingArt], selectedLayout: decorated }, fonts });
const noLayout = buildDesign({ project: base, fonts });

test("a full design gives a valid, self-contained picture", () => {
  const r = buildProofSvg(full)!;
  assert.ok(r);
  assert.match(r.svg, /^<\?xml[^>]*\?>\n<svg [^>]*viewBox="0 0 [\d.]+ [\d.]+">/);
  assert.ok(r.svg.trimEnd().endsWith("</svg>"));
  assert.ok(r.widthMm > 300 && r.heightMm > 300);
  assert.match(r.svg, new RegExp(`width="${r.widthMm}mm" height="${r.heightMm}mm"`));
  assert.ok(r.svg.includes(PROOF_COLOURS.piece));
  assert.ok(!/NaN|Infinity/.test(r.svg));
});

test("no text, images, scripts, references or cut colours", () => {
  const { svg } = buildProofSvg(full)!;
  assert.ok(!/<text|<image|<script|<use|href|style=|onload|<foreignObject/i.test(svg));
  for (const c of Object.values(DEFAULT_OPERATION_COLOURS)) {
    if (c !== "#000000") assert.ok(!svg.toLowerCase().includes(c.toLowerCase()));
  }
  assert.ok(!svg.includes("#d00000") && !svg.includes("#e00000"));
});

test("background option and margin", () => {
  const white = buildProofSvg(full)!;
  const clear = buildProofSvg(full, { background: "transparent" })!;
  assert.ok(white.svg.includes('fill="#ffffff"'));
  assert.ok(!clear.svg.includes('fill="#ffffff"'));
  const wide = buildProofSvg(full, { marginMm: 20 })!;
  assert.ok(Math.abs(wide.widthMm - white.widthMm - 30) < 0.01);
});

test("deterministic", () => {
  assert.equal(buildProofSvg(full)!.svg, buildProofSvg(full)!.svg);
});

test("a frame without a crossword still gives a picture; no frame gives null", () => {
  const r = buildProofSvg(noLayout)!;
  assert.ok(r);
  assert.ok(!r.svg.includes(PROOF_COLOURS.piece));
  assert.equal(buildProofSvg({ ...noLayout, frame: null }), null);
});

test("pixel width option sets unit-less size in proportion", () => {
  const mm = buildProofSvg(full)!;
  const px = buildProofSvg(full, { widthPx: 2000 })!;
  const m = /width="2000" height="(\d+)" viewBox/.exec(px.svg);
  assert.ok(m);
  assert.ok(Math.abs(Number(m[1]) - Math.round((2000 * mm.heightMm) / mm.widthMm)) <= 1);
  assert.ok(!px.svg.includes("mm\""));
});

test("the backer placement mark is drawn on the backer, beneath the crossword", () => {
  assert.ok(full.backerMark.length > 0);
  const lines = buildProofSvg(full)!.svg.split("\n");
  const mark = lines.findIndex((l) => l.includes('fill="none"') && l.includes('stroke-width="0.25"'));
  const piece = lines.findIndex((l) => l.includes(`fill="${PROOF_COLOURS.piece}"`));
  const backer = lines.findIndex((l) => l.includes(`fill="${PROOF_COLOURS.backer}"`));
  assert.ok(backer >= 0 && mark > backer && mark < piece);
  const none = buildProofSvg(noLayout)!.svg;
  assert.ok(!none.includes('fill="none" stroke="#6b4a24" stroke-width="0.25"'));
});
