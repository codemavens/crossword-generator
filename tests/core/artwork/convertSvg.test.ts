import { test } from "node:test";
import assert from "node:assert/strict";
import { OUTLINE_WARNING, cleanArtworkName, convertSvg, parseTransform } from "../../../src/core/artwork/convertSvg.ts";
import type { SvgNode } from "../../../src/core/artwork/convertSvg.ts";
import {
  ARTWORK_BOX,
  MAX_ARTWORK_NAME_LENGTH,
  MAX_ARTWORK_SHAPES,
  MAX_SVG_DEPTH,
  MAX_SVG_NODES,
} from "../../../src/core/artwork/constants.ts";
import { artworkAssetProblem } from "../../../src/core/artwork/validateAsset.ts";
import { applyAffine } from "../../../src/core/artwork/pathData.ts";

function el(tag: string, attrs: Record<string, string> = {}, ...children: SvgNode[]): SvgNode {
  return { tag, attrs, children };
}

const svg = (...children: SvgNode[]) => el("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 100 100" }, ...children);
const square = (attrs: Record<string, string> = {}) => el("rect", { x: "10", y: "10", width: "20", height: "20", ...attrs });

function converted(root: SvgNode, name = "pic.svg") {
  const r = convertSvg(root, name);
  assert.ok(r.ok, r.ok ? "" : r.message);
  // Everything the converter produces passes the server's own check (with an id added).
  assert.equal(artworkAssetProblem({ id: "art-1", ...r.asset }), null);
  return r;
}

function stored(root: SvgNode): string {
  return JSON.stringify(converted(root).asset);
}

test("a plain square becomes one normalised shape in the 100-unit box", () => {
  const r = converted(svg(square()));
  assert.deepEqual(r.asset.shapes, [{ d: "M0 0L100 0L100 100L0 100Z", fillRule: "nonzero" }]);
  assert.deepEqual(r.asset.bounds, { minX: 0, minY: 0, maxX: ARTWORK_BOX, maxY: ARTWORK_BOX });
  assert.equal(r.asset.source, "custom");
  assert.equal(r.asset.name, "pic");
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(Object.keys(r.asset).sort(), ["bounds", "name", "shapes", "source"]);
});

test("scripts, styles, images, text, foreign content, animation, links and use are dropped", () => {
  const hostile = svg(
    el("script", {}, el("#text", { value: "alert(1)" })),
    el("style", {}, el("#text", { value: "rect { fill: url(http://evil/x) }" })),
    el("image", { href: "http://evil.example/x.png", width: "50", height: "50" }),
    el("text", { x: "0", y: "0" }),
    el("foreignObject", { width: "50", height: "50" }, el("div", {}, square())),
    el("animate", { attributeName: "x", to: "100" }),
    el("set", { attributeName: "fill", to: "red" }),
    el("a", { href: "javascript:alert(1)" }, square({ x: "60" })),
    el("use", { href: "#s", "xlink:href": "#s" }),
    el("defs", {}, el("path", { id: "s", d: "M0 0L50 0L50 50Z" })),
    el("clipPath", {}, square()),
    el("mask", {}, square()),
    el("pattern", {}, square()),
    el("filter", {}),
    el("symbol", {}, square()),
    el("metadata"),
    square(),
  );
  const r = converted(hostile);
  assert.equal(r.asset.shapes.length, 1);
  assert.deepEqual(r.asset.shapes[0], { d: "M0 0L100 0L100 100L0 100Z", fillRule: "nonzero" });
  assert.ok(r.warnings.some((w) => /not a basic shape/.test(w)));
  const json = JSON.stringify(r.asset);
  for (const banned of ["script", "alert", "http", "href", "url(", "javascript", "style", "#s"]) assert.equal(json.includes(banned), false, banned);
});

test("event handlers, ids, classes, hrefs and other attributes never reach the output", () => {
  const json = stored(
    svg(
      square({
        onclick: "alert(1)",
        onload: "alert(2)",
        id: "evil-id",
        class: "evil-class",
        href: "http://evil.example",
        "xlink:href": "http://evil.example",
        "data-x": "secret",
        style: "fill:red; background:url(http://evil.example/a.png); behavior:url(x.htc)",
      }),
    ),
  );
  for (const banned of ["alert", "evil", "secret", "http", "url", "red", "background", "behavior"]) assert.equal(json.includes(banned), false, banned);
});

test("an external url(...) fill counts as filled but the reference is not kept", () => {
  const r = converted(svg(square({ fill: "url(http://evil.example/grad.svg#g)" }), square({ x: "40", style: "fill: url(#local)" })));
  assert.equal(r.asset.shapes.length, 2);
  assert.equal(JSON.stringify(r.asset).includes("url"), false);
});

test("nested group transforms compose with the shape's own transform", () => {
  // translate(100 0) · scale(2) · rotate(90) applied to the unit square at the origin.
  const root = svg(
    el("g", { transform: "translate(100,0)" }, el("g", { transform: "scale(2)" }, el("rect", { width: "10", height: "10", transform: "rotate(90)" }))),
    // A second square fixes the overall bounds so the transformed one can be located.
    el("rect", { x: "0", y: "0", width: "1", height: "1" }),
  );
  const r = converted(root);
  // rotate(90) maps the square to x in [-10, 0]; scale 2 → [-20, 0]; translate → [80, 100], y in [0, 20].
  // Overall bounds x [0, 100], y [0, 20] → scale factor 1.
  assert.deepEqual(r.asset.bounds, { minX: 0, minY: 0, maxX: 100, maxY: 20 });
  const pts = r.asset.shapes[0]!.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const xs = pts.filter((_, i) => i % 2 === 0);
  const ys = pts.filter((_, i) => i % 2 === 1);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [80, 100, 0, 20]);
});

test("transform functions: matrix, translate, scale, rotate about a centre, skewX, skewY", () => {
  const near = (p: { x: number; y: number }, x: number, y: number) => assert.ok(Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9, `${p.x},${p.y}`);
  near(applyAffine(parseTransform("matrix(1 2 3 4 5 6)")!, 1, 1), 9, 12);
  near(applyAffine(parseTransform("translate(5)")!, 1, 1), 6, 1);
  near(applyAffine(parseTransform("scale(2, 3)")!, 1, 1), 2, 3);
  near(applyAffine(parseTransform("rotate(90 10 10)")!, 20, 10), 10, 20);
  near(applyAffine(parseTransform("skewX(45)")!, 0, 1), 1, 1);
  near(applyAffine(parseTransform("skewY(45)")!, 1, 0), 1, 1);
  // Lists apply right to left to the point.
  near(applyAffine(parseTransform("translate(10 0) scale(2)")!, 1, 1), 12, 2);
  near(applyAffine(parseTransform("translate(10,0),scale(2)")!, 1, 1), 12, 2);
  assert.equal(parseTransform("translate(1 2 3)"), null);
  assert.equal(parseTransform("url(x)"), null);
  assert.equal(parseTransform("rotate(nope)"), null);
});

test("an unreadable transform drops that element with a warning", () => {
  const r = converted(svg(square(), el("g", { transform: "bogus(1)" }, square({ x: "50" }))));
  assert.equal(r.asset.shapes.length, 1);
  assert.ok(r.warnings.some((w) => /could not be read/.test(w)));
});

test("rounded rectangles use arcs and rx alone sets ry", () => {
  const r = converted(svg(el("rect", { x: "0", y: "0", width: "100", height: "50", rx: "10" })));
  const d = r.asset.shapes[0]!.d;
  assert.match(d, /^M10 0L90 0C/);
  assert.equal((d.match(/C/g) ?? []).length, 4);
  assert.deepEqual(r.asset.bounds, { minX: 0, minY: 0, maxX: 100, maxY: 50 });
  // Radii larger than half the side are clamped.
  const pill = converted(svg(el("rect", { width: "100", height: "20", rx: "80", ry: "80" })));
  assert.deepEqual(pill.asset.bounds, { minX: 0, minY: 0, maxX: 100, maxY: 20 });
});

test("circle and ellipse bounds are exact", () => {
  const c = converted(svg(el("circle", { cx: "50", cy: "50", r: "25" })));
  assert.deepEqual(c.asset.bounds, { minX: 0, minY: 0, maxX: 100, maxY: 100 });
  const e = converted(svg(el("ellipse", { cx: "0", cy: "0", rx: "40", ry: "10" })));
  assert.deepEqual(e.asset.bounds, { minX: 0, minY: 0, maxX: 100, maxY: 25 });
});

test("polygon and polyline become closed filled shapes", () => {
  const r = converted(svg(el("polygon", { points: "0,0 10,0 10,10" }), el("polyline", { points: "20 0 30 0 30 10", fill: "#000" })));
  assert.equal(r.asset.shapes.length, 2);
  assert.ok(r.asset.shapes.every((s) => s.d.endsWith("Z")));
});

test("fill rule is taken from attribute, style or ancestors", () => {
  const r = converted(
    svg(
      el("g", { "fill-rule": "evenodd" }, square(), square({ x: "40", style: "fill-rule: nonzero" })),
      el("path", { d: "M0 60h10v10z", "fill-rule": "evenodd" }),
    ),
  );
  assert.deepEqual(r.asset.shapes.map((s) => s.fillRule), ["evenodd", "nonzero", "evenodd"]);
});

test("fill:none with a stroke is left out with the outline warning; lines count as outlines", () => {
  const r = converted(
    svg(
      square(),
      square({ x: "40", fill: "none", stroke: "black" }),
      el("line", { x1: "0", y1: "0", x2: "50", y2: "50", stroke: "black" }),
      el("g", { style: "fill:none" }, el("circle", { cx: "5", cy: "5", r: "2", stroke: "#000" })),
    ),
  );
  assert.equal(r.asset.shapes.length, 1);
  assert.deepEqual(r.warnings, [OUTLINE_WARNING]);
});

test("a child can turn fill back on under a fill:none group", () => {
  const r = converted(svg(el("g", { fill: "none" }, square({ fill: "black" }))));
  assert.equal(r.asset.shapes.length, 1);
});

test("hidden content is dropped", () => {
  const r = converted(
    svg(
      square(),
      square({ x: "50", display: "none" }),
      el("g", { style: "visibility:hidden" }, square({ x: "70" })),
      el("g", { style: "display: none !important" }, square({ x: "80" })),
    ),
  );
  assert.equal(r.asset.shapes.length, 1);
});

test("nothing usable is refused, with the outline hint when only outlines were found", () => {
  const empty = convertSvg(svg(el("text", {}), el("image", {})), "x.svg");
  assert.deepEqual(empty, { ok: false, message: "No usable shapes were found in this file." });
  const outlines = convertSvg(svg(square({ fill: "none", stroke: "black" }), el("line", { x2: "5", y2: "5", stroke: "red" })), "x.svg");
  assert.equal(outlines.ok, false);
  if (!outlines.ok) assert.match(outlines.message, /outlines alone will not engrave/);
  // Zero-size shapes have no area either.
  assert.equal(convertSvg(svg(el("rect", { width: "0", height: "10" })), "x").ok, false);
  assert.equal(convertSvg(el("html", {}, square()), "x").ok, false);
});

test("namespaced or upper-case tags are matched by local name", () => {
  const r = converted(el("svg:svg", {}, el("svg:RECT", { width: "5", height: "5" })));
  assert.equal(r.asset.shapes.length, 1);
});

test("limit: number of shapes", () => {
  const many = Array.from({ length: MAX_ARTWORK_SHAPES + 1 }, (_, i) => square({ x: String(i) }));
  const r = convertSvg(svg(...many), "x");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, new RegExp(String(MAX_ARTWORK_SHAPES)));
  assert.ok(convertSvg(svg(...many.slice(0, MAX_ARTWORK_SHAPES)), "x").ok);
});

test("limit: total path data per picture", () => {
  // Few shapes but lots of path detail.
  let d = "M0 0";
  for (let i = 1; i <= 7000; i++) d += `L${i * 0.137} ${(i * 7919) % 100.37}`;
  const r = convertSvg(svg(el("path", { d })), "x");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /too detailed/);
});

test("limit: segments while converting", () => {
  const d = "M0 0" + "A5 5 0 1 1 10 0A5 5 0 1 1 0 0".repeat(5000);
  const r = convertSvg(svg(el("path", { d })), "x");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /too detailed/);
});

test("limit: input tree node count and depth", () => {
  const wide = svg(...Array.from({ length: MAX_SVG_NODES }, () => el("desc")));
  const r1 = convertSvg(wide, "x");
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.match(r1.message, /too complex/);
  let deep: SvgNode = square();
  for (let i = 0; i < MAX_SVG_DEPTH; i++) deep = el("g", {}, deep);
  const r2 = convertSvg(svg(deep), "x");
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.match(r2.message, /nested too deeply/);
  let ok: SvgNode = square();
  for (let i = 0; i < MAX_SVG_DEPTH - 2; i++) ok = el("g", {}, ok);
  assert.ok(convertSvg(svg(ok), "x").ok);
});

test("limit: name is cleaned, trimmed and capped", () => {
  assert.equal(cleanArtworkName("  My\u0000 cat\n.SVG "), "My cat");
  assert.equal(cleanArtworkName("   "), "Uploaded picture");
  assert.equal(Array.from(cleanArtworkName("x".repeat(500))).length, MAX_ARTWORK_NAME_LENGTH);
  assert.equal(converted(svg(square()), "<b>bold</b>.svg").asset.name, "<b>bold</b>");
});

test("malformed geometry and hostile attribute shapes do not throw", () => {
  const odd = { tag: "svg", attrs: Object.create(null) as Record<string, string>, children: [null as unknown as SvgNode, { tag: 5 } as unknown as SvgNode, square()] };
  const r = convertSvg(odd, "x");
  assert.ok(r.ok);
  const bad = convertSvg(svg(el("path", { d: "M0 0 L 5 X" }), el("path", { d: "M1e999 0L1 1" }), square()), "x");
  assert.ok(bad.ok);
  if (bad.ok) assert.ok(bad.warnings.some((w) => /2 shapes could not be read/.test(w)));
});

test("a nested svg's viewBox scales its children into its width and height", () => {
  const ref = el("rect", { width: "1", height: "1" });
  const nested = (attrs: Record<string, string>) =>
    converted(svg(ref, el("svg", { viewBox: "0 0 10 10", ...attrs }, el("rect", { width: "10", height: "10" })))).asset;
  // Scale 2 at x=10: the square covers 10..30 × 0..20, so overall 0..30 × 0..20.
  const scaled = nested({ x: "10", width: "20", height: "20" });
  assert.deepEqual(scaled.bounds, { minX: 0, minY: 0, maxX: 100, maxY: 66.67 });
  // Default xMidYMid meet: scale 2, centred horizontally in a 40-wide viewport.
  const meet = nested({ width: "40", height: "20" });
  assert.equal(meet.shapes[1]!.d, "M33.33 0L100 0L100 66.67L33.33 66.67Z");
  // none stretches to 40 × 20.
  const none = nested({ width: "40", height: "20", preserveAspectRatio: "none" });
  assert.equal(none.shapes[1]!.d, "M0 0L100 0L100 50L0 50Z");
  // xMinYMin slice: scale 4, anchored top left.
  const slice = nested({ width: "40", height: "20", preserveAspectRatio: "xMinYMin slice" });
  assert.equal(slice.shapes[1]!.d, "M0 0L100 0L100 100L0 100Z");
  // Without a viewBox only x/y apply.
  const plain = converted(svg(ref, el("svg", { x: "9", width: "50", height: "50" }, el("rect", { width: "10", height: "10" })))).asset;
  assert.equal(plain.shapes[1]!.d, "M47.37 0L100 0L100 52.63L47.37 52.63Z");
});

test("a nested svg with a viewBox but no usable size is dropped with a warning", () => {
  const sizes: Record<string, string>[] = [{}, { width: "50%", height: "50%" }, { width: "20" }];
  for (const attrs of sizes) {
    const r = converted(svg(square(), el("svg", { viewBox: "0 0 10 10", ...attrs }, el("rect", { width: "10", height: "10" }))));
    assert.equal(r.asset.shapes.length, 1);
    assert.ok(r.warnings.some((w) => /no usable width and height/.test(w)), JSON.stringify(attrs));
  }
  // A zero-size viewport renders nothing and needs no warning.
  const zero = converted(svg(square(), el("svg", { viewBox: "0 0 10 10", width: "0", height: "10" }, square())));
  assert.equal(zero.asset.shapes.length, 1);
  assert.deepEqual(zero.warnings, []);
});

test("the root viewBox does not change the stored picture unless it stretches", () => {
  const shapes = () => [square(), el("circle", { cx: "60", cy: "40", r: "15" })];
  const bare = stored(el("svg", {}, ...shapes()));
  assert.equal(stored(el("svg", { viewBox: "5 -3 50 50", width: "200", height: "300" }, ...shapes())), bare);
  assert.equal(stored(el("svg", { viewBox: "0 0 100 100" }, ...shapes())), bare);
  assert.equal(stored(el("svg", { viewBox: "0 0 100 100", width: "100%", height: "100%" }, ...shapes())), bare);
  // preserveAspectRatio="none" on the root stretches non-uniformly, which rescaling alone would lose.
  const stretched = converted(el("svg", { viewBox: "0 0 100 100", width: "200", height: "100", preserveAspectRatio: "none" }, square())).asset;
  assert.deepEqual(stretched.bounds, { minX: 0, minY: 0, maxX: 100, maxY: 50 });
});

test("visibility is inherited and a visible descendant of a hidden group still renders", () => {
  const r = converted(
    svg(
      el("g", { visibility: "hidden" }, square(), square({ x: "50", visibility: "visible" }), el("g", { style: "visibility: visible" }, square({ x: "80" }))),
      el("g", { style: "visibility:collapse" }, el("g", {}, square({ y: "60" }))),
      square({ y: "80", visibility: "hidden" }),
    ),
  );
  assert.equal(r.asset.shapes.length, 2);
  // Hidden outlines are not counted as outlines either.
  const hiddenOutline = converted(svg(square(), square({ fill: "none", stroke: "black", visibility: "hidden" })));
  assert.deepEqual(hiddenOutline.warnings, []);
  // display:none still prunes, whatever the descendants say.
  const pruned = converted(svg(square(), el("g", { display: "none" }, square({ x: "50", display: "inline", visibility: "visible" }))));
  assert.equal(pruned.asset.shapes.length, 1);
});
