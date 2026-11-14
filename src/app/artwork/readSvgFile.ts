// Reads an uploaded SVG file into the converter's neutral tree. The parsed document is inert and never inserted into the page.
import { convertSvg, type ConvertResult, type SvgNode } from "../../core/artwork/convertSvg.ts";
import { MAX_ARTWORK_FILE_BYTES } from "../../core/artwork/constants.ts";

const NOT_READABLE = "This file is not a readable SVG.";
const MAX_READ_DEPTH = 64;

function toNode(el: Element, depth: number): SvgNode {
  const attrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) attrs[a.localName.toLowerCase()] = a.value;
  const children: SvgNode[] = [];
  if (depth < MAX_READ_DEPTH) {
    for (const child of Array.from(el.children)) children.push(toNode(child, depth + 1));
  }
  return { tag: el.localName.toLowerCase(), attrs, children };
}

export async function readSvgFile(file: File): Promise<ConvertResult> {
  if (file.size > MAX_ARTWORK_FILE_BYTES) {
    return { ok: false, message: `This file is too large. The limit is ${Math.floor(MAX_ARTWORK_FILE_BYTES / 1024)} KB.` };
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, message: NOT_READABLE };
  }
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.getElementsByTagName("parsererror").length > 0 || !root || root.localName.toLowerCase() !== "svg") {
    return { ok: false, message: NOT_READABLE };
  }
  return convertSvg(toNode(root, 0), file.name);
}
