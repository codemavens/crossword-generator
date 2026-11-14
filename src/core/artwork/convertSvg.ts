// Converts an uploaded SVG (as a neutral tree built by the app's inert XML parser) into stored shape data.
// Allow-list only: nothing from the file except shape geometry and fill rule reaches the output (CHG-0007 AC6, AC7).
import type { ArtworkAsset, ArtworkShape } from "../models/project.ts";
import type { Bounds } from "../geometry/types.ts";
import {
  ARTWORK_BOX,
  ARTWORK_DECIMALS,
  MAX_ARTWORK_NAME_LENGTH,
  MAX_ARTWORK_PATH_CHARS,
  MAX_ARTWORK_SEGMENTS,
  MAX_ARTWORK_SHAPES,
  MAX_SVG_DEPTH,
  MAX_SVG_NODES,
} from "./constants.ts";
import {
  IDENTITY,
  compactSegments,
  hasDrawing,
  multiplyAffine,
  parsePathData,
  roundSegments,
  segmentsBounds,
  serializeSegments,
  transformSegments,
  unionBounds,
} from "./pathData.ts";
import type { Affine, PathSegment } from "./pathData.ts";

export interface SvgNode {
  // Element local name; compared case-insensitively.
  tag: string;
  attrs: Record<string, string>;
  children: SvgNode[];
}

export type ConvertResult =
  | { ok: true; asset: Omit<ArtworkAsset, "id">; warnings: string[] }
  | { ok: false; message: string };

export type FinishResult = { ok: true; shapes: ArtworkShape[]; bounds: Bounds } | { ok: false; message: string };

export interface RawShape {
  segments: PathSegment[];
  fillRule: ArtworkShape["fillRule"];
}

const CONTAINERS = new Set(["svg", "g"]);
const SHAPES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
// Dropped silently: they never carry drawing.
const QUIET = new Set(["title", "desc", "metadata"]);
const STYLE_PROPS = ["fill", "fill-rule", "stroke", "display", "visibility"] as const;
type StyleProp = (typeof STYLE_PROPS)[number];

export const OUTLINE_WARNING = "Some shapes are outlines only (no fill) and were left out: outlines alone will not engrave.";
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const NUMBER_SCAN = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const UNIT_PX: Record<string, number> = { "": 1, px: 1, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 4 / 3, pc: 16 };

class Refusal extends Error {}

function localName(tag: unknown): string {
  if (typeof tag !== "string") return "";
  const lower = tag.toLowerCase();
  const colon = lower.lastIndexOf(":");
  return colon >= 0 ? lower.slice(colon + 1) : lower;
}

function attr(node: SvgNode, key: string): string | undefined {
  const attrs = node.attrs;
  if (typeof attrs !== "object" || attrs === null || !Object.hasOwn(attrs, key)) return undefined;
  const v = attrs[key];
  return typeof v === "string" ? v : undefined;
}

function childrenOf(node: SvgNode): SvgNode[] {
  return Array.isArray(node.children) ? node.children : [];
}

// Presentation attributes, overridden by the same few declarations from inline style; nothing else is read.
function presentation(node: SvgNode): Partial<Record<StyleProp, string>> {
  const out: Partial<Record<StyleProp, string>> = {};
  for (const p of STYLE_PROPS) {
    const v = attr(node, p);
    if (v !== undefined) out[p] = v.trim().toLowerCase();
  }
  const style = attr(node, "style");
  if (style !== undefined) {
    for (const decl of style.split(";")) {
      const colon = decl.indexOf(":");
      if (colon < 0) continue;
      const prop = decl.slice(0, colon).trim().toLowerCase();
      const value = decl.slice(colon + 1).replace(/!important/i, "").trim().toLowerCase();
      if ((STYLE_PROPS as readonly string[]).includes(prop)) out[prop as StyleProp] = value;
    }
  }
  for (const p of STYLE_PROPS) if (out[p] === "inherit" || out[p] === "") delete out[p];
  return out;
}

function parseNumberList(s: string): number[] {
  const out: number[] = [];
  let i = 0;
  for (;;) {
    while (i < s.length && /[\s,]/.test(s[i]!)) i++;
    if (i >= s.length) break;
    NUMBER_SCAN.lastIndex = i;
    const m = NUMBER_SCAN.exec(s);
    if (!m) break;
    const v = Number(m[0]);
    if (!Number.isFinite(v)) break;
    out.push(v);
    i += m[0].length;
  }
  return out;
}

export function parseLength(value: string | undefined): number | null {
  if (value === undefined) return null;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(px|mm|cm|in|pt|pc)?\s*$/i.exec(value);
  if (!m) return null;
  const v = Number(m[1]) * UNIT_PX[(m[2] ?? "").toLowerCase()]!;
  return Number.isFinite(v) ? v : null;
}

// SVG transform list; null when unreadable.
export function parseTransform(value: string): Affine | null {
  let m: Affine = IDENTITY;
  const re = /\s*([A-Za-z]+)\s*\(([^()]*)\)\s*,?/y;
  let i = 0;
  while (i < value.length) {
    if (/^[\s,]*$/.test(value.slice(i))) break;
    re.lastIndex = i;
    const match = re.exec(value);
    if (!match) return null;
    i = re.lastIndex;
    const raw = match[2]!.trim();
    const parts = raw === "" ? [] : raw.split(/[\s,]+/);
    if (!parts.every((p) => NUMBER.test(p))) return null;
    const a = parts.map(Number);
    if (!a.every(Number.isFinite)) return null;
    let t: Affine;
    const rad = (deg: number) => (deg * Math.PI) / 180;
    switch (match[1]) {
      case "matrix":
        if (a.length !== 6) return null;
        t = { a: a[0]!, b: a[1]!, c: a[2]!, d: a[3]!, e: a[4]!, f: a[5]! };
        break;
      case "translate":
        if (a.length !== 1 && a.length !== 2) return null;
        t = { ...IDENTITY, e: a[0]!, f: a[1] ?? 0 };
        break;
      case "scale":
        if (a.length !== 1 && a.length !== 2) return null;
        t = { ...IDENTITY, a: a[0]!, d: a[1] ?? a[0]! };
        break;
      case "rotate": {
        if (a.length !== 1 && a.length !== 3) return null;
        const cos = Math.cos(rad(a[0]!));
        const sin = Math.sin(rad(a[0]!));
        const r: Affine = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
        const cx = a[1] ?? 0;
        const cy = a[2] ?? 0;
        t = multiplyAffine(multiplyAffine({ ...IDENTITY, e: cx, f: cy }, r), { ...IDENTITY, e: -cx, f: -cy });
        break;
      }
      case "skewX":
        if (a.length !== 1) return null;
        t = { ...IDENTITY, c: Math.tan(rad(a[0]!)) };
        break;
      case "skewY":
        if (a.length !== 1) return null;
        t = { ...IDENTITY, b: Math.tan(rad(a[0]!)) };
        break;
      default:
        return null;
    }
    m = multiplyAffine(m, t);
  }
  return m;
}

const n = (v: number) => String(v);

function rectPath(node: SvgNode): string | null {
  const x = parseLength(attr(node, "x")) ?? 0;
  const y = parseLength(attr(node, "y")) ?? 0;
  const w = parseLength(attr(node, "width"));
  const h = parseLength(attr(node, "height"));
  if (w === null || h === null || w <= 0 || h <= 0) return null;
  const rxRaw = parseLength(attr(node, "rx"));
  const ryRaw = parseLength(attr(node, "ry"));
  const rxOk = rxRaw !== null && rxRaw >= 0 ? rxRaw : null;
  const ryOk = ryRaw !== null && ryRaw >= 0 ? ryRaw : null;
  // A missing radius takes the other one's value (SVG 2 "auto").
  const rx = Math.min(rxOk ?? ryOk ?? 0, w / 2);
  const ry = Math.min(ryOk ?? rxOk ?? 0, h / 2);
  if (rx <= 0 || ry <= 0) return `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;
  const arc = (ex: number, ey: number) => `A${n(rx)} ${n(ry)} 0 0 1 ${n(ex)} ${n(ey)}`;
  return (
    `M${n(x + rx)} ${n(y)}H${n(x + w - rx)}${arc(x + w, y + ry)}V${n(y + h - ry)}${arc(x + w - rx, y + h)}` +
    `H${n(x + rx)}${arc(x, y + h - ry)}V${n(y + ry)}${arc(x + rx, y)}Z`
  );
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string | null {
  if (!(rx > 0) || !(ry > 0)) return null;
  const arc = (ex: number) => `A${n(rx)} ${n(ry)} 0 1 1 ${n(ex)} ${n(cy)}`;
  return `M${n(cx + rx)} ${n(cy)}${arc(cx - rx)}${arc(cx + rx)}Z`;
}

function pointsPath(node: SvgNode): string | null {
  const nums = parseNumberList(attr(node, "points") ?? "");
  if (nums.length < 4) return null;
  let d = "";
  for (let k = 0; k + 1 < nums.length; k += 2) d += `${k === 0 ? "M" : "L"}${n(nums[k]!)} ${n(nums[k + 1]!)}`;
  return d + "Z";
}

function shapePath(tag: string, node: SvgNode): string | null {
  switch (tag) {
    case "path": {
      const d = attr(node, "d");
      return d === undefined || d.trim() === "" ? null : d;
    }
    case "rect":
      return rectPath(node);
    case "circle": {
      const r = parseLength(attr(node, "r")) ?? 0;
      return ellipsePath(parseLength(attr(node, "cx")) ?? 0, parseLength(attr(node, "cy")) ?? 0, r, r);
    }
    case "ellipse":
      return ellipsePath(
        parseLength(attr(node, "cx")) ?? 0,
        parseLength(attr(node, "cy")) ?? 0,
        parseLength(attr(node, "rx")) ?? 0,
        parseLength(attr(node, "ry")) ?? 0,
      );
    case "polyline":
    case "polygon":
      // Filled polylines render as if closed.
      return pointsPath(node);
    default:
      return null;
  }
}

// Refuses input trees that are too large or deep before any work is done.
function checkTreeSize(root: SvgNode): void {
  let count = 0;
  const stack: [SvgNode, number][] = [[root, 1]];
  while (stack.length > 0) {
    const [node, depth] = stack.pop()!;
    if (++count > MAX_SVG_NODES) throw new Refusal("This file is too complex to use as artwork.");
    if (depth > MAX_SVG_DEPTH) throw new Refusal("This file is nested too deeply to use as artwork.");
    if (typeof node !== "object" || node === null) continue;
    for (const child of childrenOf(node)) stack.push([child, depth + 1]);
  }
}

export function cleanArtworkName(name: string): string {
  const cleaned = String(name)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.svg$/i, "")
    .trim();
  const short = Array.from(cleaned).slice(0, MAX_ARTWORK_NAME_LENGTH).join("").trim();
  return short === "" ? "Uploaded picture" : short;
}

// Rescales shapes so the larger side spans ARTWORK_BOX units from the origin, rounds and serialises them.
export function finishArtwork(raw: readonly RawShape[]): FinishResult {
  let bounds: Bounds | null = null;
  for (const s of raw) bounds = unionBounds(bounds, segmentsBounds(s.segments));
  const extent = bounds ? Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) : 0;
  if (!bounds || !(extent > 0) || !Number.isFinite(extent)) return { ok: false, message: "No usable shapes were found in this file." };
  const k = ARTWORK_BOX / extent;
  const m: Affine = { a: k, b: 0, c: 0, d: k, e: -bounds.minX * k, f: -bounds.minY * k };
  const shapes: ArtworkShape[] = [];
  let finalBounds: Bounds | null = null;
  let chars = 0;
  for (const s of raw) {
    const segments = compactSegments(roundSegments(transformSegments(s.segments, m), ARTWORK_DECIMALS));
    if (!hasDrawing(segments)) continue;
    const d = serializeSegments(segments, ARTWORK_DECIMALS);
    chars += d.length;
    finalBounds = unionBounds(finalBounds, segmentsBounds(segments));
    shapes.push({ d, fillRule: s.fillRule });
  }
  if (shapes.length === 0 || !finalBounds) return { ok: false, message: "No usable shapes were found in this file." };
  if (shapes.length > MAX_ARTWORK_SHAPES) return { ok: false, message: `This picture has more than ${MAX_ARTWORK_SHAPES} shapes.` };
  if (chars > MAX_ARTWORK_PATH_CHARS) return { ok: false, message: "This picture is too detailed to store." };
  const b = finalBounds as Bounds;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { ok: true, shapes, bounds: { minX: r(b.minX), minY: r(b.minY), maxX: r(b.maxX), maxY: r(b.maxY) } };
}

interface Inherited {
  matrix: Affine;
  fill: string;
  fillRule: ArtworkShape["fillRule"];
  stroke: string;
  // Inherited; a descendant may turn it back on, so hidden groups are not pruned.
  visible: boolean;
}

const ALIGN = /^(none|x(min|mid|max)y(min|mid|max))(?:\s+(meet|slice))?$/;
const ALIGN_FACTOR: Record<string, number> = { min: 0, mid: 0.5, max: 1 };

// Viewport transform of an svg element (x/y, width/height, viewBox, preserveAspectRatio).
// null = has a viewBox but no usable size; "empty" = renders nothing.
export function viewportTransform(node: SvgNode, isRoot: boolean): Affine | null | "empty" {
  const x = isRoot ? 0 : (parseLength(attr(node, "x")) ?? 0);
  const y = isRoot ? 0 : (parseLength(attr(node, "y")) ?? 0);
  const place: Affine = { ...IDENTITY, e: x, f: y };
  const vbNums = parseNumberList(attr(node, "viewBox") ?? "");
  if (vbNums.length !== 4) return place;
  const [minX, minY, vw, vh] = vbNums as [number, number, number, number];
  if (!(vw > 0) || !(vh > 0)) return "empty";
  const wAttr = attr(node, "width");
  const hAttr = attr(node, "height");
  // A root without a usable size is treated as its viewBox (uniform, so rescaling removes it); a nested svg's would be a percentage.
  if (isRoot && wAttr === undefined && hAttr === undefined) return place;
  const w = wAttr === undefined && isRoot ? vw : parseLength(wAttr);
  const h = hAttr === undefined && isRoot ? vh : parseLength(hAttr);
  if (w === null || h === null || w < 0 || h < 0) return isRoot ? place : null;
  if (w === 0 || h === 0) return "empty";
  let sx = w / vw;
  let sy = h / vh;
  let ax = 0.5;
  let ay = 0.5;
  const par = (attr(node, "preserveAspectRatio") ?? "").trim().toLowerCase().replace(/^defer\s+/, "");
  const m = ALIGN.exec(par);
  if (!m || m[1] !== "none") {
    if (m) {
      ax = ALIGN_FACTOR[m[2]!]!;
      ay = ALIGN_FACTOR[m[3]!]!;
    }
    const k = m?.[4] === "slice" ? Math.max(sx, sy) : Math.min(sx, sy);
    sx = sy = k;
  }
  return { a: sx, b: 0, c: 0, d: sy, e: x + ax * (w - vw * sx) - minX * sx, f: y + ay * (h - vh * sy) - minY * sy };
}

export function convertSvg(root: SvgNode, name: string): ConvertResult {
  try {
    return convertOrThrow(root, name);
  } catch (err) {
    if (err instanceof Refusal) return { ok: false, message: err.message };
    throw err;
  }
}

function convertOrThrow(root: SvgNode, name: string): ConvertResult {
  if (typeof root !== "object" || root === null || localName(root.tag) !== "svg") {
    return { ok: false, message: "This file is not an SVG image." };
  }
  checkTreeSize(root);
  const raw: RawShape[] = [];
  let segmentCount = 0;
  let outlines = 0;
  let unreadable = 0;
  let unsupported = false;
  let unsized = 0;

  const visit = (node: SvgNode, parent: Inherited, isRoot: boolean) => {
    if (typeof node !== "object" || node === null) return;
    const tag = localName(node.tag);
    if (!CONTAINERS.has(tag) && !SHAPES.has(tag)) {
      if (!QUIET.has(tag)) unsupported = true;
      return;
    }
    const p = presentation(node);
    if (p.display === "none") return;
    let matrix = parent.matrix;
    const transform = attr(node, "transform");
    if (transform !== undefined) {
      const own = parseTransform(transform);
      if (!own) {
        unreadable++;
        return;
      }
      matrix = multiplyAffine(matrix, own);
    }
    if (tag === "svg") {
      const viewport = viewportTransform(node, isRoot);
      if (viewport === "empty") return;
      if (viewport === null) {
        unsized++;
        return;
      }
      matrix = multiplyAffine(matrix, viewport);
    }
    const here: Inherited = {
      matrix,
      fill: p.fill ?? parent.fill,
      fillRule: p["fill-rule"] === "evenodd" ? "evenodd" : p["fill-rule"] === "nonzero" ? "nonzero" : parent.fillRule,
      stroke: p.stroke ?? parent.stroke,
      visible: p.visibility === "hidden" || p.visibility === "collapse" ? false : p.visibility === "visible" ? true : parent.visible,
    };
    if (CONTAINERS.has(tag)) {
      for (const child of childrenOf(node)) visit(child, here, false);
      return;
    }
    if (!here.visible) return;
    const stroked = here.stroke !== "none";
    // A url(...) fill counts as filled; the reference itself is never followed or kept.
    if (tag === "line" || here.fill === "none") {
      if (stroked) outlines++;
      return;
    }
    const d = shapePath(tag, node);
    if (d === null) return;
    const parsed = parsePathData(d, { maxSegments: MAX_ARTWORK_SEGMENTS - segmentCount });
    if (!parsed.ok) {
      if (/too detailed/.test(parsed.message)) throw new Refusal("This picture is too detailed to store.");
      unreadable++;
      return;
    }
    segmentCount += parsed.segments.length;
    const segments = compactSegments(transformSegments(parsed.segments, matrix));
    if (!hasDrawing(segments)) return;
    raw.push({ segments, fillRule: here.fillRule });
    if (raw.length > MAX_ARTWORK_SHAPES) throw new Refusal(`This picture has more than ${MAX_ARTWORK_SHAPES} shapes.`);
  };

  visit(root, { matrix: IDENTITY, fill: "black", fillRule: "nonzero", stroke: "none", visible: true }, true);

  if (raw.length === 0) {
    const message =
      outlines > 0
        ? "No filled shapes were found. This file has only outlines, and outlines alone will not engrave."
        : "No usable shapes were found in this file.";
    return { ok: false, message };
  }
  const finished = finishArtwork(raw);
  if (!finished.ok) return finished;
  const warnings: string[] = [];
  if (outlines > 0) warnings.push(OUTLINE_WARNING);
  if (unsupported) warnings.push("Some content that is not a basic shape (for example text, images or effects) was left out.");
  if (unsized > 0) warnings.push("A nested image with no usable width and height was left out.");
  if (unreadable > 0) warnings.push(`${unreadable} shape${unreadable === 1 ? "" : "s"} could not be read and ${unreadable === 1 ? "was" : "were"} left out.`);
  return {
    ok: true,
    asset: { name: cleanArtworkName(name), source: "custom", shapes: finished.shapes, bounds: finished.bounds },
    warnings,
  };
}
