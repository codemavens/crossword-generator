# Sloth & Llama — Crossword Name Art Generator

A planned local production tool for designing personalized Scrabble-style family name art and exporting accurate SVGs for LightBurn.

**Status: Phase 1 of 9 (application foundation). There is no solver, frame geometry or export yet.**

## Documentation

- [Full project specification](docs/SPEC.md): the complete original specification, preserved verbatim with all 27 sections.
- [Original source](docs/original-spec.md): the user-saved source document, retained unchanged.
- [Documentation and repository setup brief](docs/tasks/CHG-0001.md): approved scope and acceptance criteria for this documentation and repository setup task.
- [Phase 1 brief](docs/tasks/CHG-0002.md): scope and acceptance criteria for the application foundation.

## The product

The design consists of **three separately cut wooden pieces**, aligned and glued together:

1. **Crossword:** one continuous union of uniform square tiles, with engraved characters/artwork and scored internal divisions.
2. **Frame:** a perfectly circular exterior with a smooth, buffered family-name region welded into the lower inner edge. The family name and optional year are engraved.
3. **Backer:** a solid circular disk matching the frame exterior, with no internal cutouts.

The frame's inner contour follows the overall upper silhouette of the family-name region with a rubber-band effect. It must not become a separate plaque or individual glyph cutouts.

## Application direction

- React, TypeScript, and Vite frontend; local Node.js API; SQLite project storage.
- Approved libraries: opentype.js, clipper2-ts, and Paper.js. Additional libraries require explicit approval with their purpose, license, and project URL.
- Custom standalone TypeScript solver, optimized for approximately 2–10 names.
- Perpendicular matching-character intersections or explicit single-tile connectors; matching apostrophes and hyphens may intersect.
- Per-tile decorative artwork and manual beginning/end decorations. No individual-name dragging, rotation, or locking in V1.
- Configurable weights: circular fit **25**, compactness **20**, visual balance **35**, natural intersections **40**, few automatic connectors **45**.
- Separate `crossword.svg`, `frame.svg`, and `backer.svg`, with cut, score, and engrave operations; optional combined cutting-sheet SVG.
- Save, reopen, search, duplicate, and import/export customer projects locally.

See the specification for the nine implementation phases and V1 definition of done.

## Running it

Requires Node 24.11 or newer (`node -v`). The service refuses to start on anything older.

```sh
npm install
npm run dev        # API on 127.0.0.1:4310, app on http://127.0.0.1:5173
```

To run it as one process without the Vite dev server:

```sh
npm run build
npm start          # app and API on http://127.0.0.1:4310
```

Other commands:

```sh
npm test           # automated tests (node:test)
npm run typecheck  # TypeScript checks for core, app and server
```

Projects are stored in `data/projects.db`, which Git ignores. Set `SLOTH_DB_PATH` or `PORT` to override the defaults. Node prints an experimental warning for its built-in SQLite module on start-up; it is harmless.

## Code layout

- `src/core/`: shared models, validation and (later) the solver, geometry and export engines. It cannot use React, the DOM or Node.
- `src/app/`: the React interface.
- `server/`: the local API and SQLite repository.
- `tests/`: automated tests.
- [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md): every package with its version, licence and purpose.

## Local data and repository policy

Target directory: `~/projects/codemavens/crossword-generator`.

Keep private databases and journals, customer uploads, generated exports, secrets, build output, and dependencies out of Git. Commit source, the package lockfile, migrations, dependency/license records, and deliberately curated non-private fixtures when implementation begins.

GitHub repository: [codemavens/crossword-generator](https://github.com/codemavens/crossword-generator). The user created this remote and authorized connecting it on 2026-11-13. Subsequent non-trivial application work requires an approved numbered task brief and a dedicated task worktree.
