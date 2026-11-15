# Sloth & Llama — Crossword Name Art Designer

A local tool for designing "crossword name art". Family names are arranged like a crossword, on Scrabble-style tiles, inside a round wooden frame. The family name is welded into the bottom of the frame. The tool exports three SVG files for the laser cutter: the crossword, the frame and a solid backer. Together they make three wooden layers.

The tool runs on your own computer. It is a React and Vite web page, a small Node service and a SQLite database file. It does not call any outside service.

**Status:** all software work for V1 is built. The laser steps (LightBurn import, test cuts, tuning the defaults) still need a person. See [`docs/handover.md`](docs/handover.md).

## Requirements

- Node 24.11.0 or newer. Check with `node -v`. The service refuses to start on an older version.
- A modern web browser.
- Optional, for developers only: Inkscape, used by `scripts/check-export.ts` to check file sizes.

When the service starts, Node prints an "ExperimentalWarning" about SQLite. The SQLite module that comes with Node is still marked experimental. The warning is harmless.

## Install

```sh
npm install
```

## Run

```sh
npm run build
npm start
```

Then open <http://127.0.0.1:4310> in your browser.

- `npm run build` builds the web page into the `dist/` folder.
- `npm start` starts one process that serves the page and the API. It listens on `127.0.0.1` only, so other computers cannot reach it.
- `PORT` changes the port. Example: `PORT=4400 npm start`.
- `SLOTH_DB_PATH` changes the database file. A relative path is resolved from the repository folder.
- By default the database is `data/projects.db` in the repository folder. Git ignores the `data/` folder.

If `dist/` does not exist, the service starts but serves no web page. Run `npm run build` first.

## Development mode

```sh
npm run dev
```

This starts two processes:

- the Node service, restarted automatically when its files change (`node --watch server/main.ts`), on port 4310;
- the Vite dev server, on <http://127.0.0.1:5173>, which sends requests under `/api` to the Node service.

Open <http://127.0.0.1:5173> while developing. Stop both with Ctrl+C. `PORT` is honoured by both processes.

## Tests and checks

```sh
npm test                          # automated tests (node:test)
npm run typecheck                 # TypeScript checks for core, app and server
node scripts/check-export.ts      # export check, see below
```

`node scripts/check-export.ts [outDir]` builds the three export files for a sample design and writes them to `outDir`. The default is a folder called `sloth-export-check` in the system temporary folder. If Inkscape's command line is found, it also checks the size of each file in millimetres. It looks on the `PATH` and in `/Applications/Inkscape.app`. If Inkscape is not found, it says so and skips the size check. The script exits with an error only when a size does not match.

The tests cannot replace a look at the files in Inkscape and LightBurn. See [`docs/handover.md`](docs/handover.md).

## How to use it

The window has a top bar and three parts. The top bar shows the title, the project name, the save status and the **Save** button. On the left is a rail with **Projects**, then six steps: Details, Arrangement, Fonts, Frame, Tiles and Export. The preview stays in the centre. The controls for the chosen rail entry are in one panel on the right. Below about 1000 px wide the three parts stack, one above the other.

Steps unlock in order. A step opens once the steps before it are complete, and you can always go back to an earlier step. Each step has a **Next** button.

Above the preview are **Edit end tiles**, **Centre**, the position readout and on/off chips for the layers (Frame, Backer, Cut lines, Score lines, Engraving, Crossword). The **Size and fit** bar below the preview shows the tile size, the frame diameter, the crossword size and whether it fits.

This is the normal workflow.

1. **Create a project.** In **Projects**, click **New**. In **Details**, enter a project name (required), a customer name (optional), the family name and an optional year.
2. **Enter the names.** In **Details**, add one name per row with **Add name**. Names have no spaces. Use a hyphen or an apostrophe if needed (for example `MARY-ANN`).
3. **Generate.** In **Arrangement**, click **Generate**. The tool shows several crossword arrangements with scores.
4. **Choose one.** Click an arrangement to use it. The preview shows the crossword inside the frame.
5. **Choose fonts.** In **Fonts**, pick the family name font, the year font and the tile letter font. See "Fonts" below.
6. **Set the frame.** In **Frame**, set the outer diameter and the other frame values. In **Tiles**, set the tile size and the letter size. Use the number fields or the sliders.
7. **Edit the end tiles and pictures.** Click **Edit end tiles** above the preview. Click `+` at the end of a name to add a decorative tile. Click a tile to choose its picture. You can pick a built-in picture or upload your own SVG. Click **Done editing end tiles** when finished.
8. **Move and resize.** Drag the crossword in the preview to move it. Or select it and use the arrow keys (Shift moves 5 mm per step). **Centre** puts it back in the default position. **Largest that fits** (in **Tiles**) sets the biggest tile size that fits the frame. **Smallest that fits** (in **Frame**) sets the smallest diameter that fits the crossword. The tool changes a size only when you press one of these buttons or edit the value yourself.
9. **Check the fit.** The **Size and fit** bar below the preview shows the tile size, the frame diameter, the crossword size and whether it fits. If it does not fit, reduce the tile size, increase the diameter or move the crossword.
10. **Export.** In **Export**, check that the readiness card says "Ready to export", and check the operation colours. Click **Download all three**, or download each file alone.
11. **Save.** Click **Save** in the top bar. The tool does not save by itself. Unsaved work is lost when you close the page.

Open a saved project from the **Projects** list with **Open**. It opens at the Details step and shows the same design: same arrangement, position, tiles, pictures, fonts and settings.

### Project workflow

- **Search projects.** The **Projects** list (the first entry in the left rail) has a search box. It filters by project name or customer name. The match ignores upper and lower case.
- **Delete and remove font.** **Delete** on a project and **Remove** on a font ask first, in a dialog with **Cancel** and a destructive button. Escape or **Cancel** closes it without doing anything.
- **Duplicate.** Each project in the list has a **Duplicate** button. The copy gets a new id and a name ending in " (copy)". It does not depend on the original.
- **Export project (JSON) and Import project….** The first saves the open project as a JSON file. The second reads one. An imported file goes through the same checks as a normal save, gets a new id, and is refused with a message if it is invalid or larger than 2 MB.
- **Download proof image (PNG).** In **Export**. It makes a picture of the finished piece for the customer, 2000 pixels wide. It is available before the design is ready to export.

## Fonts

Two fonts come with the tool, in `public/fonts/`. Each has its licence file next to it.

| Font | Licence | Default use |
| --- | --- | --- |
| Pacifico | SIL Open Font License 1.1 | Family name |
| Zilla Slab SemiBold | SIL Open Font License 1.1 | Year and tile letters |

To add your own fonts, click **Add fonts…** in the **Fonts** step. Pick one or many files. The tool accepts TrueType (`.ttf`) and OpenType (`.otf`) files, up to 10 MB each. The library holds up to 500 fonts. A file that is not a readable font is refused with a message, and nothing is stored.

WOFF files are not accepted, because a damaged WOFF file can make the font reader hang.

Added fonts are stored in the local SQLite database, not in the repository. They are available to every project. Open **Manage fonts** to remove one. If a project uses a font that is no longer in the library, the app says so, shows the default font in its place, and blocks export until you choose a font.

You are responsible for the licence of any font you add. Check that it allows use on products you sell.

## Exported files

Export gives three separate files. Their names start with the project name, reduced to letters, digits, `-` and `_`.

| File | Contents |
| --- | --- |
| `<project>-crossword.svg` | The crossword: outer cut, hole cuts, score lines, engraved letters, point values and pictures. |
| `<project>-frame.svg` | The frame: a round outer cut, one inner cut, and the engraved family name and year. |
| `<project>-backer.svg` | One circle with the same diameter as the frame. |

- Sizes are in millimetres. One SVG unit is one millimetre. Each file has a 1 mm margin around the drawing.
- Each file has named groups for the operations. The default colours are below. You can change them in **Export**. They are saved with the project. **Reset colours** brings the defaults back.

| Operation | Default colour | What it does |
| --- | --- | --- |
| Cut | red `#FF0000` | Cuts through the wood. |
| Score | blue `#0000FF` | Light lines between tiles. |
| Engrave | black `#000000` | Letters, point values, pictures, family name, year. |

- All text is converted to outlines. The files contain no fonts, scripts or images.
- The tool does not adjust for kerf (the width of the laser cut).
- Export is blocked when no arrangement is chosen, when the crossword has errors, or when a font is missing. If the crossword does not fit the frame, you must tick a confirmation first. It appears in the **Export** panel above the downloads.

To check the files in LightBurn, follow [`docs/lightburn-import-checklist.md`](docs/lightburn-import-checklist.md).

## Limits worth knowing

| Item | Limit |
| --- | --- |
| Names per project | At most 20 (the design is tuned for 2 to 10) |
| Name length | 2 to 30 characters |
| Name characters | Letters A to Z, accented Latin letters, apostrophe, hyphen. No spaces. |
| Text fields (project name, family name, year) | At most 200 characters |
| Tile size | Above 0 and at most 200 mm |
| Letter size | 30% to 80% of the tile size |
| Frame outer diameter | 20 mm to 2000 mm |
| Added decorative tiles | At most 2 per name |
| Uploaded picture file | SVG, at most 200 KB, at most 500 shapes |
| Uploaded pictures per project | At most 20 |
| Font file | TTF or OTF, at most 10 MB |
| Fonts in the library | At most 500 |
| Size of one save request | At most 2 MB |

Uploaded SVG pictures are converted to filled shape outlines. A file with only outlines (no filled shapes) is refused. In a file with both, the outline-only shapes are left out and the app shows a warning. Scripts and outside references are not allowed.

## Backup

All projects and all added fonts are in one SQLite file. By default it is `data/projects.db`. To back up, stop the service and copy that file. To restore, put the copy back and start the service.

Do not commit this file. It can contain customer names.

## Project layout

| Folder | Contents |
| --- | --- |
| `src/core/` | Shared logic with no React, DOM or Node: models, solver, geometry, typography, artwork, export. |
| `src/app/` | The React interface. |
| `server/` | The local service: API routes, SQLite storage, font checking. |
| `scripts/` | `dev.ts` (development mode) and `check-export.ts` (export check). |
| `public/fonts/` | Bundled fonts and their licences. |
| `tests/` | Automated tests (`core/`, `server/` and `app/`). `app/` covers the step rules and the confirmation dialog. |
| `docs/` | Specification, task briefs and checklists. |
| `data/` | The database file. Created on first start. Not in Git. |

## Documents

- [`docs/handover.md`](docs/handover.md): what is finished, what needs a person, open decisions, and which test covers each item in the specification.
- [`docs/physical-test-checklist.md`](docs/physical-test-checklist.md): what to cut and measure to tune the defaults.
- [`docs/lightburn-import-checklist.md`](docs/lightburn-import-checklist.md): how to check the files in LightBurn.
- [`docs/SPEC.md`](docs/SPEC.md): the specification (version 1.3, with dated amendments). [`docs/original-spec.md`](docs/original-spec.md) is the original, unchanged.
- [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md): every package, its version and licence.
- [`docs/tasks/`](docs/tasks/): the task briefs (CHG-0001 to CHG-0009).

GitHub repository: [codemavens/crossword-generator](https://github.com/codemavens/crossword-generator).
