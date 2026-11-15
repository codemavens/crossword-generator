// Developer check (CHG-0008 AC23): writes the three export files for a sample design and, when Inkscape's
// command line is available, confirms their size in millimetres. Usage: node scripts/check-export.ts [outDir]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFramePart, buildDesign, exportDesign, operationColours } from "../src/core/design/buildDesign.ts";
import { newProject } from "../src/core/models/defaults.ts";
import type { NameArtProject } from "../src/core/models/project.ts";
import { openingForSolver, solve } from "../src/core/solver/index.ts";
import { createFontOutliner } from "../src/core/typography/opentypeFont.ts";
import { EXPORT_MARGIN_MM, HAIRLINE_MM } from "../src/core/export/index.ts";
import type { ExportedFile } from "../src/core/export/index.ts";

const NAMES = ["SANDERS", "ANNA", "ELLA", "SAM", "SUE", "MICHAEL", "OLIVIA", "NOAH", "EMMA", "LIAM"];
const TOLERANCE_MM = 0.01;
const PX_PER_MM = 96 / 25.4;

function font(id: string, file: string) {
  const bytes = readFileSync(new URL(`../public/fonts/${file}`, import.meta.url));
  return createFontOutliner(id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

// Builds through the same buildDesign/exportDesign path the app's Export section uses.
function buildFiles(): ExportedFile[] {
  const fonts = {
    name: font("pacifico", "Pacifico-Regular.ttf"),
    year: font("zilla-slab-semibold", "ZillaSlab-SemiBold.ttf"),
    tile: font("zilla-slab-semibold", "ZillaSlab-SemiBold.ttf"),
  };
  const draft: NameArtProject = {
    ...newProject(),
    projectName: "Export check",
    familyName: "The Sanders",
    year: "2026",
    names: NAMES.map((text, i) => ({ id: `n${i}`, text })),
  };
  const { settings } = draft;
  const { frame } = buildFramePart(draft, fonts);
  if (!frame) throw new Error("The sample frame could not be built.");
  const opening = openingForSolver(frame.usableOpening, settings.tileSizeMm, settings.frame.crosswordClearanceMm);
  const layout = solve({ names: draft.names, settings: settings.solver, opening }).layouts[0]?.layout;
  if (!layout) throw new Error("The solver found no arrangement for the sample names.");
  const design = buildDesign({ project: { ...draft, selectedLayout: layout }, fonts });
  for (const p of design.crossword?.problems ?? []) console.log(`crossword ${p.severity}: ${p.message}`);
  if (design.needsFitConfirmation) console.log("note: the sample crossword does not fit inside the frame.");
  const result = exportDesign(design, operationColours(settings.export));
  if (!result.ok) throw new Error(`Export refused: ${result.blockers.map((b) => b.message).join("; ")}`);
  return result.files;
}

function findInkscape(): string | null {
  try {
    const found = execFileSync("which", ["inkscape"], { encoding: "utf8" }).trim();
    if (found) return found;
  } catch {
    // Not on PATH.
  }
  const mac = "/Applications/Inkscape.app/Contents/MacOS/inkscape";
  return existsSync(mac) ? mac : null;
}

function queryMm(inkscape: string, file: string, flag: "--query-width" | "--query-height"): number {
  const out = execFileSync(inkscape, [flag, file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return Number(out.trim().split(/\s+/).pop()) / PX_PER_MM;
}

const outDir = process.argv[2] ?? join(process.env.TMPDIR ?? tmpdir(), "sloth-export-check");
mkdirSync(outDir, { recursive: true });
const files = buildFiles();
const paths = files.map((f) => {
  const path = join(outDir, f.fileName);
  writeFileSync(path, f.svg);
  console.log(`${f.fileName}: declared ${f.widthMm} × ${f.heightMm} mm -> ${path}`);
  return path;
});

const inkscape = findInkscape();
if (!inkscape) {
  console.log("Inkscape command line not found (PATH or /Applications/Inkscape.app); size check skipped.");
  process.exit(0);
}
// Inkscape's queries measure the drawing's visual bounding box, not the page: that is the declared size less
// both margins, plus one hairline because the outermost shape is always a stroked cut.
console.log(`Inkscape: ${inkscape}`);
let allMatch = true;
files.forEach((f, i) => {
  const w = queryMm(inkscape, paths[i]!, "--query-width");
  const h = queryMm(inkscape, paths[i]!, "--query-height");
  const expectW = f.widthMm - 2 * EXPORT_MARGIN_MM + HAIRLINE_MM;
  const expectH = f.heightMm - 2 * EXPORT_MARGIN_MM + HAIRLINE_MM;
  const ok = Math.abs(w - expectW) <= TOLERANCE_MM && Math.abs(h - expectH) <= TOLERANCE_MM;
  allMatch &&= ok;
  console.log(
    `${f.fileName}: Inkscape drawing ${w.toFixed(3)} × ${h.toFixed(3)} mm, expected ${expectW.toFixed(3)} × ${expectH.toFixed(3)} mm ` +
      `(page ${f.widthMm} × ${f.heightMm} mm less margins plus hairline): ${ok ? "MATCH" : "MISMATCH"}`,
  );
});
process.exit(allMatch ? 0 : 1);
