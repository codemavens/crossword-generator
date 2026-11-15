import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_OPERATION_COLOURS,
  EXPORT_MARGIN_MM,
  exportBackerSvg,
  exportCrosswordSvg,
  exportFrameSvg,
  formatMm,
} from "../../../src/core/export/index.ts";
import type { ExportedFile } from "../../../src/core/export/index.ts";
import type { CrosswordGeometry, Segment } from "../../../src/core/geometry/crossword.ts";
import { unionByFillRule } from "../../../src/core/geometry/polygonOps.ts";
import { pointInRing, signedArea } from "../../../src/core/geometry/ringMath.ts";
import type { FontOutliner, FrameGeometry, Point, Ring } from "../../../src/core/geometry/types.ts";
import { frame, isSimpleRing, yearFont } from "../geometry/helpers.ts";
import { entries } from "../solver/helpers.ts";
import { build, decorated, layoutOf, loop, solved } from "./fixtures.ts";
import { inGroup, parsePath, parseSvg, ringsOf } from "./svgParse.ts";
import type { ParsedSvg } from "./svgParse.ts";

const M = EXPORT_MARGIN_MM;
const crossword = build(solved);
const holed = build(loop);
const deco = decorated();
const sanders = frame("The Sanders", "2026");
const all = (): ExportedFile[] => [
  exportCrosswordSvg(crossword),
  exportCrosswordSvg(holed),
  exportCrosswordSvg(deco),
  exportFrameSvg(sanders),
  exportBackerSvg(sanders),
];

const near = (a: number, b: number, tol = 0.0011): boolean => Math.abs(a - b) <= tol;

function assertSize(file: ExportedFile, w: number, h: number): void {
  const svg = parseSvg(file.svg);
  const W = w + 2 * M;
  const H = h + 2 * M;
  assert.ok(near(file.widthMm, W) && near(file.heightMm, H), `${file.fileName} ${file.widthMm}×${file.heightMm} vs ${W}×${H}`);
  assert.equal(svg.root.width, `${formatMm(file.widthMm)}mm`);
  assert.equal(svg.root.height, `${formatMm(file.heightMm)}mm`);
  assert.equal(svg.root.viewBox, `0 0 ${formatMm(file.widthMm)} ${formatMm(file.heightMm)}`);
}

// Translation the exporter applies to a crossword (its own bounds start at the margin).
const shiftOf = (g: CrosswordGeometry): Point => ({ x: M - g.bounds.minX, y: M - g.bounds.minY });
const key = (p: Point, d: Point): string => `${formatMm(p.x + d.x)},${formatMm(p.y + d.y)}`;
const segKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

function ringSegments(ring: Ring): Segment[] {
  return ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length]! }));
}

// Even-odd area of non-crossing rings: nesting depth decides the sign.
function evenOddArea(rings: Ring[]): number {
  let total = 0;
  rings.forEach((ring, i) => {
    const depth = rings.filter((other, j) => j !== i && pointInRing(ring[0]!, other)).length;
    total += (depth % 2 === 0 ? 1 : -1) * Math.abs(signedArea(ring));
  });
  return total;
}

const unionArea = (rings: Ring[]): number => Math.abs(unionByFillRule(rings, "nonzero").reduce((s, r) => s + signedArea(r), 0));
const rawArea = (rings: Ring[]): number => rings.reduce((s, r) => s + Math.abs(signedArea(r)), 0);

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function ringsCross(p: Ring, q: Ring): boolean {
  for (const s of ringSegments(p)) {
    for (const t of ringSegments(q)) {
      const d1 = cross(t.a, t.b, s.a);
      const d2 = cross(t.a, t.b, s.b);
      const d3 = cross(s.a, s.b, t.a);
      const d4 = cross(s.a, s.b, t.b);
      if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    }
  }
  return false;
}

function assertOverlapFree(svg: ParsedSvg, label: string): void {
  for (const [n, el] of inGroup(svg, "engrave").entries()) {
    const rings = ringsOf(el);
    for (const r of rings) assert.ok(isSimpleRing(r), `${label} path ${n}: self-crossing ring`);
    for (let i = 0; i < rings.length; i++) {
      for (let j = i + 1; j < rings.length; j++) {
        assert.ok(!ringsCross(rings[i]!, rings[j]!), `${label} path ${n}: rings ${i} and ${j} cross`);
      }
    }
  }
}

function engravedArea(file: ExportedFile): number {
  return inGroup(parseSvg(file.svg), "engrave").reduce((s, el) => s + evenOddArea(ringsOf(el)), 0);
}

// Overlap length of two axis-aligned segments on one line.
function overlap(p: Segment, q: Segment): number {
  const pv = p.a.x === p.b.x;
  const qv = q.a.x === q.b.x;
  if (pv !== qv) return 0;
  if (pv) {
    if (p.a.x !== q.a.x) return 0;
    return Math.max(0, Math.min(Math.max(p.a.y, p.b.y), Math.max(q.a.y, q.b.y)) - Math.max(Math.min(p.a.y, p.b.y), Math.min(q.a.y, q.b.y)));
  }
  if (p.a.y !== q.a.y) return 0;
  return Math.max(0, Math.min(Math.max(p.a.x, p.b.x), Math.max(q.a.x, q.b.x)) - Math.max(Math.min(p.a.x, p.b.x), Math.min(q.a.x, q.b.x)));
}

test("AC18: width, height and viewBox agree and equal the piece size plus margins", () => {
  for (const t of [8, 12.7, 20.3]) {
    for (const g of [build({ ...solved, tileSizeMm: t }), build({ ...loop, tileSizeMm: t }), decorated(t)]) {
      assertSize(exportCrosswordSvg(g), g.bounds.maxX - g.bounds.minX, g.bounds.maxY - g.bounds.minY);
    }
  }
  for (const outerDiameterMm of [200, 300, 412.5]) {
    const f = frame("The Sanders", "2026", { outerDiameterMm });
    const d = 2 * f.outer.r;
    assert.equal(d, outerDiameterMm);
    assertSize(exportFrameSvg(f), d, d);
    assertSize(exportBackerSvg(f), d, d);
  }
});

test("AC18: the crossword file is placed by its own bounds, not its place in the frame", () => {
  const a = build({ ...solved, originMm: { x: 0, y: 0 } });
  const b = build({ ...solved, originMm: { x: -123.4, y: 56.7 } });
  const [sa, sb] = [exportCrosswordSvg(a).svg, exportCrosswordSvg(b).svg];
  // Same text apart from last-digit rounding of curve points shifted by a different float offset.
  const numbers = (s: string) => (s.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  assert.equal(sa.replace(/-?\d+(?:\.\d+)?/g, "#"), sb.replace(/-?\d+(?:\.\d+)?/g, "#"));
  const [na, nb] = [numbers(sa), numbers(sb)];
  assert.equal(na.length, nb.length);
  na.forEach((n, i) => assert.ok(Math.abs(n - nb[i]!) <= 0.0021, `${n} vs ${nb[i]}`));
});

test("AC18: numbers have at most 3 decimals, no exponent and no -0; every coordinate lies inside the viewBox", () => {
  for (const file of all()) {
    const svg = parseSvg(file.svg);
    for (const el of svg.elements) {
      for (const [name, value] of Object.entries(el.attrs)) {
        if (!["d", "cx", "cy", "r"].includes(name)) continue;
        for (const num of value.match(/[-\d.e+]+/g) ?? []) {
          assert.match(num, /^-?\d+(\.\d{1,3})?$/, `${file.fileName} ${name}: ${num}`);
          assert.ok(!/^-0(\.0*)?$/.test(num), `${file.fileName} -0`);
        }
      }
      const pts: Point[] = [];
      if (el.tag === "path") for (const s of parsePath(el.attrs.d!)) pts.push(...s.points);
      if (el.tag === "circle") {
        const [cx, cy, r] = [Number(el.attrs.cx), Number(el.attrs.cy), Number(el.attrs.r)];
        pts.push({ x: cx - r, y: cy - r }, { x: cx + r, y: cy + r });
      }
      for (const p of pts) {
        assert.ok(p.x >= 0 && p.y >= 0 && p.x <= file.widthMm && p.y <= file.heightMm, `${file.fileName} (${p.x}, ${p.y})`);
      }
    }
    assert.ok(file.svg.includes(`width="${formatMm(file.widthMm)}mm"`));
  }
  assert.equal(formatMm(-0.0001), "0");
  assert.equal(formatMm(1e-7), "0");
  assert.equal(formatMm(1234567.89012), "1234567.89");
  assert.equal(formatMm(2.5), "2.5");
  assert.equal(formatMm(-3.14159), "-3.142");
});

test("AC19: engrave, score and cut groups in that order, only when they have content, as Inkscape layers", () => {
  const order = (f: ExportedFile) => parseSvg(f.svg).groups.map((g) => g.id);
  assert.deepEqual(order(exportCrosswordSvg(crossword)), ["engrave", "score", "cut"]);
  assert.deepEqual(order(exportFrameSvg(sanders)), ["engrave", "cut"]);
  assert.deepEqual(order(exportBackerSvg(sanders)), ["cut"]);
  const single = build({ names: entries(["SAM"]), layout: layoutOf([{ nameId: "n0", start: { x: 0, y: 0 }, direction: "horizontal" }]) });
  assert.deepEqual(order(exportCrosswordSvg(single)), ["engrave", "score", "cut"]);
  for (const file of all()) {
    const svg = parseSvg(file.svg);
    assert.equal(svg.root.xmlns, "http://www.w3.org/2000/svg");
    assert.equal(svg.root["xmlns:inkscape"], "http://www.inkscape.org/namespaces/inkscape");
    const labels: Record<string, string> = { engrave: "Engrave", score: "Score", cut: "Cut" };
    for (const g of svg.groups) {
      assert.equal(g.attrs["inkscape:groupmode"], "layer");
      assert.equal(g.attrs["inkscape:label"], labels[g.id]);
      assert.ok(inGroup(svg, g.id).length > 0, `${file.fileName} empty group ${g.id}`);
    }
    assert.ok(svg.elements.every((e) => e.group !== null), "every shape is in an operation group");
  }
});

test("AC20: cut and score are hairline strokes with no fill; engraving is filled, unstroked and even-odd", () => {
  for (const file of all()) {
    const svg = parseSvg(file.svg);
    for (const el of svg.elements) {
      if (el.group === "engrave") {
        assert.equal(el.tag, "path");
        assert.equal(el.attrs.fill, DEFAULT_OPERATION_COLOURS.engrave);
        assert.equal(el.attrs.stroke, "none");
        assert.equal(el.attrs["fill-rule"], "evenodd");
      } else {
        const colour = el.group === "cut" ? DEFAULT_OPERATION_COLOURS.cut : DEFAULT_OPERATION_COLOURS.score;
        assert.equal(el.attrs.fill, "none");
        assert.equal(el.attrs.stroke, colour);
        assert.equal(el.attrs["stroke-width"], "0.1");
        assert.equal(el.attrs["fill-rule"], undefined);
      }
    }
  }
});

test("AC20: files contain no text, images, scripts, styles, references, font attributes, events or comments", () => {
  for (const file of all()) {
    const s = file.svg;
    for (const bad of ["<text", "<image", "<script", "<style", "<use", "<foreignObject", "href", "url(", "<!--", "<a ", "<![CDATA["]) {
      assert.ok(!s.includes(bad), `${file.fileName} contains ${bad}`);
    }
    assert.ok(!/\sfont-[\w-]*=|\sfont=/.test(s), "font attribute");
    assert.ok(!/\son[a-z]+=/i.test(s), "event attribute");
    assert.ok(!/style=/.test(s), "style attribute");
    const tags = new Set([...s.matchAll(/<\/?([A-Za-z][\w:-]*)/g)].map((m) => m[1]));
    for (const tag of tags) assert.ok(["svg", "g", "path", "circle"].includes(tag!), `unexpected <${tag}>`);
  }
});

test("AC20: colours are applied when valid and fall back to the defaults when invalid", () => {
  const custom = { cut: "#00ff00", score: "#123ABC", engrave: "#ffffff" };
  const svg = parseSvg(exportCrosswordSvg(crossword, custom).svg);
  for (const el of svg.elements) {
    if (el.group === "cut") assert.equal(el.attrs.stroke, "#00FF00");
    if (el.group === "score") assert.equal(el.attrs.stroke, "#123ABC");
    if (el.group === "engrave") assert.equal(el.attrs.fill, "#FFFFFF");
  }
  const bad = { cut: "red", score: '#0000FF" onload="x', engrave: "#12345" };
  const fallback = exportCrosswordSvg(crossword, bad as never);
  assert.equal(fallback.svg, exportCrosswordSvg(crossword).svg);
  assert.equal(exportFrameSvg(sanders, { cut: "url(#x)" }).svg, exportFrameSvg(sanders).svg);
  assert.equal(exportBackerSvg(sanders, { cut: "#00FF00" }).svg.includes('stroke="#00FF00"'), true);
});

test("AC21: crossword holes are separate closed paths written before the outer cut", () => {
  const g = holed;
  assert.equal(g.cut.holes.length, 1);
  const cut = inGroup(parseSvg(exportCrosswordSvg(g).svg), "cut");
  assert.equal(cut.length, 2);
  const d = shiftOf(g);
  const asKeys = (ring: Ring) => ring.map((p) => key(p, d));
  for (const el of cut) {
    const subs = parsePath(el.attrs.d!);
    assert.equal(subs.length, 1);
    assert.ok(subs[0]!.closed);
  }
  assert.deepEqual(ringsOf(cut[0]!).map((r) => r.map((p) => `${formatMm(p.x)},${formatMm(p.y)}`)), [asKeys(g.cut.holes[0]!)]);
  assert.deepEqual(ringsOf(cut[1]!).map((r) => r.map((p) => `${formatMm(p.x)},${formatMm(p.y)}`)), [asKeys(g.cut.outer)]);
});

test("AC21: cut segments equal the geometry's rings, with no duplicates; score count matches and never lies on a cut edge", () => {
  for (const g of [crossword, holed, deco]) {
    const svg = parseSvg(exportCrosswordSvg(g).svg);
    const d = shiftOf(g);
    const fileCut = inGroup(svg, "cut").flatMap(ringsOf).flatMap(ringSegments);
    const fileKeys = fileCut.map((s) => segKey(key(s.a, { x: 0, y: 0 }), key(s.b, { x: 0, y: 0 })));
    const geoKeys = [...g.cut.holes, g.cut.outer].flatMap(ringSegments).map((s) => segKey(key(s.a, d), key(s.b, d)));
    assert.deepEqual([...fileKeys].sort(), [...geoKeys].sort());
    assert.equal(new Set(fileKeys).size, fileKeys.length, "duplicate cut segment");

    const score = inGroup(svg, "score");
    assert.equal(score.length, g.score.length);
    const fileScore = score.map((el) => {
      const subs = parsePath(el.attrs.d!);
      assert.equal(subs.length, 1);
      assert.equal(subs[0]!.points.length, 2);
      assert.ok(!subs[0]!.closed);
      return { a: subs[0]!.points[0]!, b: subs[0]!.points[1]! };
    });
    const scoreKeys = fileScore.map((s) => segKey(key(s.a, { x: 0, y: 0 }), key(s.b, { x: 0, y: 0 })));
    assert.equal(new Set(scoreKeys).size, scoreKeys.length, "duplicate score segment");
    for (const s of fileScore) {
      for (const c of fileCut) assert.equal(overlap(s, c), 0, "score lies on a cut edge");
    }
    // Also in geometry space, before rounding.
    const geoCut = [...g.cut.holes, g.cut.outer].flatMap(ringSegments);
    for (const s of g.score) for (const c of geoCut) assert.ok(overlap(s, c) < 1e-9);
  }
});

test("AC21: frame is a true circle after a single closed inner cut path; name and year are engraved", () => {
  const svg = parseSvg(exportFrameSvg(sanders).svg);
  const cut = inGroup(svg, "cut");
  assert.deepEqual(cut.map((e) => e.tag), ["path", "circle"]);
  const subs = parsePath(cut[0]!.attrs.d!);
  assert.equal(subs.length, 1);
  assert.ok(subs[0]!.closed);
  assert.ok(subs[0]!.points.length >= sanders.innerCut.length * 0.9);
  assert.equal(Number(cut[1]!.attrs.r), sanders.outer.r);
  assert.equal(Number(cut[1]!.attrs.cx), sanders.outer.r + M);
  assert.equal(Number(cut[1]!.attrs.cy), sanders.outer.r + M);
  assert.equal(inGroup(svg, "engrave").length, 2);
  assert.equal(svg.elements.filter((e) => e.tag === "polygon" || e.tag === "polyline").length, 0);
});

test("AC21: a frame without an opening still exports its circle and engraving", () => {
  const noOpening: FrameGeometry = { ...sanders, innerCut: [] };
  const svg = parseSvg(exportFrameSvg(noOpening).svg);
  assert.deepEqual(inGroup(svg, "cut").map((e) => e.tag), ["circle"]);
  assert.equal(inGroup(svg, "engrave").length, 2);
  const noYear = parseSvg(exportFrameSvg(frame("The Sanders")).svg);
  assert.equal(inGroup(noYear, "engrave").length, 1);
});

test("AC21: the backer is exactly one circle with the frame's outer radius", () => {
  for (const outerDiameterMm of [200, 300]) {
    const f = frame("The Sanders", "2026", { outerDiameterMm });
    const file = exportBackerSvg(f);
    const svg = parseSvg(file.svg);
    assert.equal(file.fileName, "backer.svg");
    assert.equal(svg.elements.length, 1);
    assert.equal(svg.elements[0]!.tag, "circle");
    assert.equal(svg.elements[0]!.group, "cut");
    assert.equal(Number(svg.elements[0]!.attrs.r), f.outer.r);
  }
});

test("engraving is normalised: area matches the union and never exceeds the raw rings", () => {
  const cases: [string, ExportedFile, Ring[], number][] = [
    ["frame", exportFrameSvg(sanders), [], unionArea(sanders.engraving.name) + unionArea(sanders.engraving.year)],
  ];
  const tileUnion = (g: CrosswordGeometry): number =>
    g.tiles.reduce((s, t) => {
      const art = t.artwork.flatMap((a) => unionByFillRule(a.rings, a.fillRule));
      return s + unionArea(t.letter) + unionArea(t.score) + (art.length ? unionArea(art) : 0);
    }, 0);
  for (const g of [crossword, deco]) cases.push(["crossword", exportCrosswordSvg(g), [], tileUnion(g)]);
  for (const [label, file, , expected] of cases) {
    const area = engravedArea(file);
    assert.ok(area > 0, label);
    assert.ok(Math.abs(area - expected) <= Math.max(0.05, expected * 0.002), `${label}: ${area} vs ${expected}`);
  }
  assert.ok(engravedArea(exportFrameSvg(sanders)) <= rawArea([...sanders.engraving.name, ...sanders.engraving.year]) + 1e-6);
  const g = deco;
  const raw = rawArea([...g.engraving.letters, ...g.engraving.scores, ...g.engraving.artwork.flatMap((a) => a.rings)]);
  assert.ok(engravedArea(exportCrosswordSvg(g)) <= raw + 1e-6);
});

test("overlapping contours: the Pacifico family name is unioned into non-crossing rings", () => {
  const raw = sanders.engraving.name;
  const svg = parseSvg(exportFrameSvg(sanders).svg);
  const name = ringsOf(inGroup(svg, "engrave")[0]!);
  const area = evenOddArea(name);
  assert.ok(area <= rawArea(raw), `${area} > ${rawArea(raw)}`);
  // The raw outlines really overlap: even-odd over them would differ from their non-zero union.
  const rawEvenOdd = Math.abs(unionByFillRule(raw, "evenodd").reduce((s, r) => s + signedArea(r), 0));
  assert.ok(Math.abs(rawEvenOdd - unionArea(raw)) > 0.01, "fixture should contain overlapping contours");
  assertOverlapFree(svg, "frame");
});

test("overlapping artwork shapes and tile letters export as non-crossing rings", () => {
  assertOverlapFree(parseSvg(exportCrosswordSvg(deco).svg), "decorated");
  assertOverlapFree(parseSvg(exportCrosswordSvg(crossword).svg), "crossword");
  const art = deco.tiles.find((t) => t.artwork.length === 3);
  assert.ok(art, "the overlapping custom picture is on a tile");
});

test("identical input gives byte-identical output", () => {
  assert.equal(exportCrosswordSvg(decorated()).svg, exportCrosswordSvg(decorated()).svg);
  assert.equal(exportFrameSvg(frame("The Sanders", "2026")).svg, exportFrameSvg(frame("The Sanders", "2026")).svg);
  assert.equal(exportBackerSvg(sanders).svg, exportBackerSvg(frame("The Sanders", "2026")).svg);
});

test("file names are fixed", () => {
  assert.equal(exportCrosswordSvg(crossword).fileName, "crossword.svg");
  assert.equal(exportFrameSvg(sanders).fileName, "frame.svg");
  assert.equal(exportBackerSvg(sanders).fileName, "backer.svg");
});

test("empty or degenerate geometry returns a valid minimal SVG instead of throwing", () => {
  const empty = build({ names: [], layout: layoutOf([]) });
  assert.ok(empty.problems.some((p) => p.severity === "error"));
  const file = exportCrosswordSvg(empty);
  assert.equal(file.isEmpty, true);
  assert.equal(file.widthMm, 2 * M);
  assert.equal(file.heightMm, 2 * M);
  const svg = parseSvg(file.svg);
  assert.equal(svg.groups.length, 0);
  assert.equal(svg.root.viewBox, "0 0 2 2");

  // A glyph the tile font cannot draw is an error, but the rest still exports.
  const noB: FontOutliner = {
    id: "no-b",
    outline: (text, size) => yearFont.outline(text, size),
    hasGlyphs: (text) => !text.includes("B") && yearFont.hasGlyphs(text),
  };
  const single = layoutOf([{ nameId: "n0", start: { x: 0, y: 0 }, direction: "horizontal" }]);
  const missing = build({ names: entries(["CAB"]), layout: single, tileFont: noB });
  assert.ok(missing.problems.some((p) => p.code === "missing-glyph" && p.severity === "error"));
  const out = exportCrosswordSvg(missing);
  assert.equal(out.isEmpty, false);
  assert.deepEqual(parseSvg(out.svg).groups.map((g) => g.id), ["engrave", "score", "cut"]);

  const nan: CrosswordGeometry = {
    ...crossword,
    cut: { outer: [{ x: NaN, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], holes: [] },
    score: [{ a: { x: 0, y: 0 }, b: { x: Infinity, y: 0 } }],
    tiles: [],
  };
  const nanFile = exportCrosswordSvg(nan);
  assert.equal(nanFile.isEmpty, true);
  assert.ok(!/NaN|Infinity/.test(nanFile.svg));
  assert.equal(exportFrameSvg({ ...sanders, outer: { cx: 0, cy: 0, r: 0 }, innerCut: [], engraving: { name: [], year: [] } }).isEmpty, true);
});
