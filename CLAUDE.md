# CLAUDE.md

Claude-specific working notes for the `oss-charts` monorepo. `AGENTS.md` has the condensed
repo guidelines (structure, commands, style, testing, commit conventions) — this file
expands on it with more detail for Claude Code sessions. If the two ever disagree, prefer
what's actually true of the code over either document, and update both.

**Note on project activity**: last commit as of this writing is `c17e9af` (21 Jan 2026,
"feat: add drawing tools"). This project has been dormant for several months — treat
architectural assumptions as possibly stale and re-verify against the code before large
changes.

## What this is

`oss-charts` — an OSS candlestick charting app: SvelteKit frontend rendering
`lightweight-charts`, a Fastify API backend serving Alpaca-sourced or mock OHLCV data with a
SQLite cache, and shared TypeScript packages for resampling/session logic and technical
indicators.

## Workspace structure (pnpm, see `pnpm-workspace.yaml`: `apps/*` + `packages/*`)

- `apps/web` (`@oss-charts/web`) — SvelteKit 2 / Svelte 5 frontend. Candlestick chart UI,
  indicator controls. Depends on `@oss-charts/core` and `@oss-charts/indicators` via
  `workspace:*`. Env: `apps/web/.env` (see `.env.example`).
- `apps/api` (`@oss-charts/api`) — Fastify 5 backend. Serves Alpaca or mock market data,
  caches in SQLite via `better-sqlite3` (`apps/api/data/cache.sqlite`), `src/providers/` for
  data sources, `src/services/` for business logic, `src/db.ts`, `src/index.ts` entrypoint.
  Mock candles: `apps/api/data/mock-candles.json`. Env: `apps/api/.env` — `DATA_MODE=mock`
  (default, uses local candles) or `DATA_MODE=alpaca` (needs Alpaca API keys). Has a
  `Dockerfile` and `railway.toml` — deployable to Railway.
- `packages/core` (`@oss-charts/core`) — shared types, `resample.ts`, `session.ts`. No build
  step needed for consumption inside the workspace (`exports: "./src/index.ts"` — TS source
  directly, pnpm workspace resolution handles it); `build` script exists (`tsc`) for
  standalone/publish use.
- `packages/indicators` (`@oss-charts/indicators`) — indicator registry (`registry.ts`) +
  implementations under `src/indicators/` (SMA, EMA, RSI, Anchored VWAP per AGENTS.md).
  Depends on `@oss-charts/core` via `workspace:*`.

Package dependency order: `core` → `indicators` → `web`/`api` (both apps depend on `core`;
`web` also depends on `indicators`). Both packages export raw `.ts` via `exports` field, so
changes in `core`/`indicators` are picked up immediately by dependents in dev — no rebuild
step needed inside the workspace, only for external consumption.

## Commands (verified against root `package.json`, run from repo root)

```bash
pnpm install                              # install all workspaces
pnpm dev                                  # concurrently runs api + web dev servers (color-coded)
pnpm --filter @oss-charts/api dev         # API only: tsx watch src/index.ts
pnpm --filter @oss-charts/web dev         # web only: vite dev (SvelteKit)
pnpm build                                # pnpm -r build — builds every workspace package
pnpm test                                 # pnpm -r test — vitest run in every package
pnpm lint                                 # eslint . (root eslint.config.mjs, flat config)
pnpm format                               # prettier --write . (.prettierrc)
```

Per-package scripts also exist (`build`, `test`, `lint`, and for `web`: `check` via
`svelte-check`, `preview`; for `api`: `start` runs the built `dist/index.js`). Use
`pnpm --filter <pkg> <script>` to target one package instead of `pnpm -r`.

## Conventions

- TypeScript everywhere, strict mode (`tsconfig.base.json`: `strict: true`, ES2022 target,
  Bundler module resolution). Each package/app has its own `tsconfig.json` — check whether
  it extends `tsconfig.base.json` before assuming compiler options.
- 2-space indentation, single quotes, Prettier-formatted (`.prettierrc`,
  `.prettierignore` excludes build output).
- ESLint flat config at root (`eslint.config.mjs`) covers `.ts` and `.svelte` files
  separately (svelte-eslint-parser for the latter); `no-unused-vars` is off in favor of
  `@typescript-eslint/no-unused-vars` with `^_` ignore pattern for intentionally unused args.
- File naming: kebab-case for files, PascalCase for Svelte components.
- Tests: Vitest, `*.test.ts`, live in each package's `test/` directory (e.g.
  `packages/core/test/resample.test.ts`, `apps/api/test/request-validation.test.ts`). Add
  tests for new indicator math and resampling behavior per AGENTS.md.
- No enforced commit message convention — keep commits concise and descriptive.
- LICENSE + NOTICE present — this repo is OSS-intended; keep that in mind for headers,
  attribution, and dependency licensing when adding third-party code.
