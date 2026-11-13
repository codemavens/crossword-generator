# Sloth & Llama — Crossword Name Art Generator

A planned local production tool for designing personalized Scrabble-style family name art and exporting accurate SVGs for LightBurn.

**Status: V1 planning specification. Application implementation has not started.**

## Documentation

- [Full project specification](docs/SPEC.md): the complete original specification, preserved verbatim with all 27 sections.
- [Original source](docs/original-spec.md): the user-saved source document, retained unchanged.
- [Documentation and repository setup brief](docs/tasks/CHG-0001.md): approved scope and acceptance criteria for this documentation and repository setup task.

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

The project contains documentation only. There are no application installation, development-server, or test commands yet. See the specification for the nine implementation phases and V1 definition of done.

## Local data and repository policy

Target directory: `~/projects/codemavens/crossword-generator`.

Keep private databases and journals, customer uploads, generated exports, secrets, build output, and dependencies out of Git. Commit source, the package lockfile, migrations, dependency/license records, and deliberately curated non-private fixtures when implementation begins.

GitHub repository: [codemavens/crossword-generator](https://github.com/codemavens/crossword-generator). The user created this remote and authorized connecting it on 2026-11-13. Subsequent non-trivial application work requires an approved numbered task brief and a dedicated task worktree.
