// Minimal hand-written types for the parts of opentype.js 2.0.0 that src/core/typography uses.
declare module "opentype.js" {
  export interface PathCommand {
    type: "M" | "L" | "C" | "Q" | "Z";
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }

  export interface Path {
    commands: PathCommand[];
  }

  export interface RenderOptions {
    kerning?: boolean;
    drawSVG?: boolean;
    drawLayers?: boolean;
  }

  export interface Glyph {
    path: Path; // lazily parsed outline
  }

  export interface GlyphSet {
    length: number;
    get(index: number): Glyph | undefined;
  }

  export interface Font {
    unitsPerEm: number;
    numGlyphs: number;
    glyphs: GlyphSet;
    getEnglishName(name: string): string | undefined;
    charToGlyphIndex(char: string): number;
    getPath(text: string, x: number, y: number, fontSize: number, options?: RenderOptions): Path;
    getAdvanceWidth(text: string, fontSize: number, options?: RenderOptions): number;
  }

  export function parse(buffer: ArrayBuffer): Font;

  const opentype: { parse: typeof parse };
  export default opentype;
}
