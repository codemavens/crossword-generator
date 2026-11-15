// Minimal SVG tokeniser for the exporter's own output (no XML library).
import type { Point, Ring } from "../../../src/core/geometry/types.ts";

export interface Element {
  tag: string;
  attrs: Record<string, string>;
  // Id of the enclosing <g>, or null at the root.
  group: string | null;
}

export interface ParsedSvg {
  root: Record<string, string>;
  groups: { id: string; attrs: Record<string, string> }[];
  elements: Element[];
}

export function parseAttrs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
    if (m[1]! in out) throw new Error(`duplicate attribute ${m[1]}`);
    out[m[1]!] = m[2]!;
  }
  return out;
}

export function parseSvg(svg: string): ParsedSvg {
  const rootMatch = /<svg\s([^>]*)>/.exec(svg);
  if (!rootMatch) throw new Error("no <svg> root");
  const groups: ParsedSvg["groups"] = [];
  const elements: Element[] = [];
  let current: string | null = null;
  for (const m of svg.matchAll(/<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, rest, selfClosing] = m;
    if (tag === "svg") continue;
    if (tag === "g") {
      if (closing) current = null;
      else {
        const attrs = parseAttrs(rest!);
        groups.push({ id: attrs.id ?? "", attrs });
        current = attrs.id ?? "";
      }
      continue;
    }
    if (closing) continue;
    if (!selfClosing) throw new Error(`<${tag}> is not self-closing`);
    elements.push({ tag: tag!, attrs: parseAttrs(rest!), group: current });
  }
  return { root: parseAttrs(rootMatch[1]!), groups, elements };
}

export interface Subpath {
  points: Point[];
  closed: boolean;
}

// Parses the exporter's "M x y L x y ... Z" data.
export function parsePath(d: string): Subpath[] {
  const tokens = d.match(/[MLZ]|-?\d+(?:\.\d+)?/g) ?? [];
  const out: Subpath[] = [];
  let cur: Subpath | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === "M" || t === "L") {
      const p = { x: Number(tokens[i + 1]), y: Number(tokens[i + 2]) };
      i += 2;
      if (t === "M") {
        cur = { points: [p], closed: false };
        out.push(cur);
      } else cur!.points.push(p);
    } else if (t === "Z") cur!.closed = true;
    else throw new Error(`unexpected token ${t}`);
  }
  return out;
}

export function ringsOf(el: Element): Ring[] {
  return parsePath(el.attrs.d ?? "").map((s) => s.points);
}

export function inGroup(svg: ParsedSvg, id: string): Element[] {
  return svg.elements.filter((e) => e.group === id);
}
