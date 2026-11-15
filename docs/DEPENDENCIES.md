# Dependencies

Every package is pinned to an exact version in `package.json` and locked in `package-lock.json`. Adding or upgrading a package needs explicit approval with its purpose, licence and project URL (see `SPEC.md` §11.2–11.3).

## Installed

| Package | Version | Licence | Purpose |
|---|---|---|---|
| `react` | 19.3.1 | MIT | Web interface |
| `react-dom` | 19.3.1 | MIT | Renders React in the browser |
| `vite` | 8.3.8 | MIT | Frontend dev server and build (dev only) |
| `@vitejs/plugin-react` | 6.3.0 | MIT | React support for Vite (dev only) |
| `typescript` | 7.0.2 | Apache-2.0 | Type checking (dev only) |
| `@types/react` | 19.3.0 | MIT | React type definitions (dev only) |
| `@types/react-dom` | 19.3.0 | MIT | React DOM type definitions (dev only) |
| `opentype.js` | 2.0.0 | MIT | Font parsing, glyph outlines and checking added fonts (TTF and OTF only: WOFF is refused because its bundled inflater can hang on malformed data); used only in `src/core/typography/` |
| `clipper2-ts` | 2.0.1-19 | BSL-1.0 | Polygon union, difference and offset; used only in `src/core/geometry/polygonOps.ts` |
| `@types/node` | 24.19.2 | MIT | Node type definitions (dev only) |

Transitive packages are recorded in `package-lock.json`.

## Approved, not installed

| Package | Licence | Purpose |
|---|---|---|
| `paper` (Paper.js) | MIT | Curve smoothing, only if `clipper2-ts` proves insufficient |

## Bundled fonts

Fonts live in `public/fonts/` with their licence files. Fonts the user adds are not listed here: they are stored in the local database, not in the repository.

| Font | File | Licence | Default use |
|---|---|---|---|
| Pacifico | `Pacifico-Regular.ttf` | SIL Open Font License 1.1 (`Pacifico-OFL.txt`) | Family name |
| Zilla Slab SemiBold | `ZillaSlab-SemiBold.ttf` | SIL Open Font License 1.1 (`ZillaSlab-OFL.txt`) | Year and tile letters |

Both were downloaded from the `google/fonts` repository on 2026-11-13. `opentype.js` ships without TypeScript types; a hand-written declaration for the parts used is in `src/core/typography/opentype.d.ts`.

## Platform features used instead of packages

- `node:sqlite` for the project and font database (`server/database/`). It is a release candidate in current Node releases and prints an experimental warning on Node 24.11.
- `node:http` for the local API.
- `node:worker_threads` to inspect uploaded font files in a separate thread with time and memory limits (`server/fonts/`).
- `node:crypto`, `node:fs`, `node:fs/promises`, `node:os` and `node:path` in the service and scripts.
- `node:child_process` in `scripts/dev.ts` (development mode) and `scripts/check-export.ts` (runs Inkscape when found).
- `node:test` for automated tests.
- Node's built-in TypeScript support to run the service and scripts without a build step.
- Web Workers in the browser: the solver runs in `src/app/solver/solver.worker.ts`, so the page stays responsive.
- `Intl.Segmenter` (built into Node and browsers) to count characters in names.

## Optional developer tool

- Inkscape (command line), not a dependency and not part of the running app. `scripts/check-export.ts` uses it, when found on the `PATH` or in `/Applications/Inkscape.app`, to check the size in millimetres of the exported files. Without it, that check is skipped.
