# Handover

State of the tool at the end of CHG-0009 (see [`tasks/CHG-0009.md`](tasks/CHG-0009.md)). Date: 2026-11-14. CHG-0008 is in pull requests #7 to #11. CHG-0009 is a separate pull request on `feature/workspace-ui`.

## What is finished

- The whole V1 workflow in `SPEC.md` §26, in software: project, names, fonts, frame, solver, arrangement choice, end tiles and pictures, move and resize, fit feedback, export, save and reopen.
- Crossword cut, score and engrave geometry in millimetres, shown in the preview and used by the export, so the two cannot differ.
- Frame with the welded family name, and the backer with a score outline showing where to glue the crossword.
- Three separate SVG files with named operation groups and changeable colours.
- A local font library for TTF and OTF fonts, stored in the database.
- Automated tests and a typecheck. The export check script (`node scripts/check-export.ts`) matched the declared file sizes using Inkscape's command line on the machine where it was last run.
- Project search, duplicate, JSON import and export, and the customer proof image (PNG).
- The workspace layout (CHG-0009): a top bar with the title, project name, save status and Save; a left rail with Projects and six steps (Details, Arrangement, Fonts, Frame, Tiles, Export) that unlock in order; the preview in the centre with its toolbar above and the Size and fit bar below; one control panel on the right. Below about 1000 px the three parts stack. Delete project and Remove font use a styled confirmation dialog. Only the layout changed. Solver, geometry, export and server behaviour are as before.

## What needs a person

The software work cannot claim these. Nobody has done them yet.

| Task | Who and how |
| --- | --- |
| Import the three files into LightBurn and check size, layers and cut order | Mike. Follow [`lightburn-import-checklist.md`](lightburn-import-checklist.md). |
| Open the files in Inkscape and look at them | Mike or a developer. The script only checks sizes. It does not check that the drawing looks right. |
| Laser cuts | Mike. Follow [`physical-test-checklist.md`](physical-test-checklist.md). |
| Tune the defaults (tile size, diameter, ring width, buffer, fonts, colours) | Mike, from the cut results. |
| Test with Mike's own fonts | Mike. The assistant could not read `/Volumes/files/SlothAndLlama/Fonts` (the operating system refused access). No user font file has been tested. Add them with **Add fonts…**. |

## Decisions confirmed

Mike confirmed these on 2026-11-14. They are how the tool works.

- **Outline-only SVG uploads are refused.** A picture with no filled shapes is refused. A picture with some filled and some outline shapes is accepted, and the outline shapes are left out with a warning.
- **Accented capitals on tiles with a point value are drawn smaller.** A tall accented capital is nudged, then scaled down, so it stays inside the tile and keeps a gap from the point value.
- **Scoring formulas stay as they are for now.** Mike will tune them later if he sees a problem in the ranking.
- **Several candidates can share one shape.** When names share no letters, the connectors can make several candidates with the same outline. This is accepted.
- **Resizing.** The tile-size slider, the "Largest that fits" button and the letter-size setting for the crossword, and the diameter slider and "Smallest that fits" button for the frame and backer, are what Mike wanted.
- **Operation colours.** Cut red, score blue and engrave black are the defaults. They can still be changed per project.

## Open decisions

None.

## Known limitations

- No kerf compensation. The app draws exact sizes. See the physical test checklist.
- No autosave. Press **Save**. Unsaved work is lost when the page closes.
- Millimetres only. No inches.
- WOFF fonts are refused, because a damaged WOFF file can hang the font reader. Use TTF or OTF.
- Only the whole crossword can be moved. Single names and tiles cannot be moved.
- Thin joins are not strengthened. Choose another arrangement or a larger tile if a join is weak.
- The first start prints an "ExperimentalWarning" about SQLite. It is harmless.

## Tests mapped to the specification

This maps the test list in `SPEC.md` §20 to the automated test files (under `tests/core/` unless a path says otherwise). "Needs a person" means no automated test can cover it.

### Solver tests

| Spec item | Covered by |
| --- | --- |
| Two names sharing a character | `solver/solve.test.ts` |
| Two names with no shared characters | `solver/connectors.test.ts`, `solver/solve.test.ts` |
| Names sharing multiple possible characters | `solver/solve.test.ts` |
| Repeated letters | `solver/solve.test.ts` |
| Names with matching apostrophes | `solver/solve.test.ts`, `solver/normalize.test.ts` |
| Names with matching hyphens | `solver/solve.test.ts`, `solver/normalize.test.ts` |
| Invalid punctuation intersection | `solver/solve.test.ts`, `solver/validate.test.ts` |
| Names with identical text | `solver/solve.test.ts` |
| Unintended parallel adjacency | `solver/validate.test.ts` |
| Accidental physical contact | `solver/validate.test.ts` |
| Valid single-tile connector | `solver/connectors.test.ts` |
| Invalid two-tile connector chain | `solver/connectors.test.ts` |
| Connector between parallel names | `solver/connectors.test.ts` |
| Connector at an invalid interior position | `solver/connectors.test.ts` |
| Manual decorative end tile | `solver/connectors.test.ts` |
| All names included exactly once | `solver/solve.test.ts` |
| Entire crossword connected | `solver/solve.test.ts`, `solver/validate.test.ts` |
| Deterministic generation with identical seed | `solver/solve.test.ts`, `solver/connectors.test.ts`, `solver/regression.test.ts` |

### Geometry tests

| Spec item | Covered by |
| --- | --- |
| Every square has the configured tile size | `geometry/crossword.test.ts` |
| Changing tile size updates all squares | `geometry/crossword.test.ts` |
| Shared intersections do not duplicate tiles | `geometry/crossword.test.ts` |
| Crossword union contains no duplicate perimeter segments | `geometry/crossword.test.ts`, `export/svgExport.test.ts` |
| Internal tile lines are scored, not cut | `geometry/crossword.test.ts`, `export/svgExport.test.ts` |
| Frame exterior remains exactly circular | `geometry/frame.test.ts`, `export/svgExport.test.ts` |
| Family-name region merges into frame | `geometry/frame.test.ts` |
| Rubber-band contour encloses engraving with the specified margin | `geometry/frame.test.ts` |
| Frame has one intended connected shape | `geometry/frame.test.ts` |
| Backer matches the frame exterior | `geometry/frame.test.ts`, `export/svgExport.test.ts` |
| No unintended internal cutouts | `geometry/crossword.test.ts` (holes only where names enclose a square), `geometry/frame.test.ts` |

### Export tests

| Spec item | Covered by |
| --- | --- |
| Correct physical dimensions | `export/svgExport.test.ts`, `design/buildDesign.test.ts`. Real-program size check: `scripts/check-export.ts` (needs Inkscape on the machine). |
| Correct cut and engrave separation | `export/svgExport.test.ts` |
| Font conversion to paths | `export/svgExport.test.ts` (no text elements), `geometry/opentypeFont.test.ts` |
| Valid SVG output | `export/svgExport.test.ts` checks the structure with a small test parser. Opening in real programs: needs a person. |
| LightBurn import | Needs a person. |
| Inkscape verification | Size check is scripted (`scripts/check-export.ts`). Visual inspection needs a person. |

### Performance tests

| Spec item | Covered by |
| --- | --- |
| Typical 2 to 6 name designs | Several solver tests solve small name sets and run in the normal test run. No separate timing limit for 2 to 6 names. |
| 10-name designs as upper-end scenarios | `solver/solve.test.ts` and `solver/connectors.test.ts` (time limits per search mode) |
| Related: frame, fit and sizing speed | `geometry/frame.test.ts` (huge diameter), `solver/fit.test.ts` (tiny tiles), `sizing.test.ts` (worst case) |

### Whole workflow

| Item | Covered by |
| --- | --- |
| `SPEC.md` §26 steps 2 to 17 without a browser | `tests/core/endToEnd.test.ts` |
| Server routes, database and font library | `tests/server/` |
| Step order, unlock rules and the confirmation dialog | `tests/app/steps.test.ts`, `tests/app/confirmations.test.ts` |
