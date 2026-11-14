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
| `@types/node` | 24.19.2 | MIT | Node type definitions (dev only) |

Transitive packages are recorded in `package-lock.json`.

## Approved, not yet installed

Installed when the phase that needs them starts.

| Package | Licence | Purpose |
|---|---|---|
| `opentype.js` | MIT | Font loading and glyph outlines |
| `clipper2-ts` | BSL-1.0 | Polygon union, difference and offset |
| `paper` (Paper.js) | MIT | Curve smoothing, only if `clipper2-ts` proves insufficient |

## Platform features used instead of packages

- `node:sqlite` for the project database. It is a release candidate in current Node releases and prints an experimental warning on Node 24.11.
- `node:http` for the local API.
- `node:test` for automated tests.
- Node's built-in TypeScript support to run the service without a build step.
