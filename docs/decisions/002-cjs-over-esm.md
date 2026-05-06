# ADR 002 — Use CommonJS (CJS) instead of ESM

**Date:** 2025
**Status:** Accepted

## Context

Node.js supports two module systems: CommonJS (`require`/`module.exports`) and ES Modules (`import`/`export`). The project uses two native addons — `better-sqlite3` and `canvas` — both of which have historically had compatibility issues with ESM in Electron environments.

## Decision

Use CommonJS throughout (`'use strict'` + `require`).

## Rationale

At the time of initial development:

1. **`better-sqlite3`** ships a native `.node` binary. Its ESM support in Electron is incomplete and requires workarounds (`createRequire`, dynamic import) that add complexity without benefit.
2. **Electron** itself uses CommonJS for its main process. Mixing ESM and CJS in the same Electron process requires careful configuration of `package.json` `"type"` field and can cause subtle load-order issues with `require('electron')`.
3. **Vitest** supports both, but its CJS mode is simpler to configure when the source files are also CJS.

The CJS constraint is scoped to the main process and business logic (`core/`, `ai/`, `store/`, `integrations/`). The renderer process files are browser-context scripts and are not subject to this constraint.

## Trade-offs accepted

- No top-level `await` in module scope (CJS is synchronous at module load time). Async initialisation is handled by explicit `async` functions called at startup.
- No tree-shaking by bundlers (not relevant — this is a desktop app, not a browser bundle).

## Alternatives considered

- **Full ESM** — rejected at this stage due to `better-sqlite3` + Electron friction. Revisit when both libraries have stable ESM support in Electron.
- **Dual CJS/ESM** — rejected: unnecessary complexity for a single-runtime desktop app.
