# Repository Guidelines

## Project Structure & Module Organization
- `apps/web`: SvelteKit frontend (candlestick charts, indicators UI).
- `apps/api`: Fastify backend (Alpaca + mock data, SQLite cache).
- `packages/core`: shared types, resampling, session helpers.
- `packages/indicators`: indicator registry + implementations (SMA, EMA, RSI, Anchored VWAP).
- Tests live alongside packages in `packages/*/test`.
- Mock candles live in `apps/api/data/mock-candles.json`.

## Build, Test, and Development Commands
Run commands from the repo root:
- `pnpm install` — install dependencies for all workspaces.
- `pnpm dev` — run API + web in watch mode.
- `pnpm test` — run unit tests for all packages.
- `pnpm --filter @oss-charts/web dev` — run only the web app.
- `pnpm --filter @oss-charts/api dev` — run only the API.
- `pnpm lint` — ESLint across the repo.
- `pnpm format` — Prettier formatting.

## Coding Style & Naming Conventions
- TypeScript across all apps/packages; 2-space indentation; single quotes.
- Format with Prettier (`.prettierrc`), lint with ESLint (`.eslintrc.cjs`).
- File names: `kebab-case` for files, `PascalCase` for Svelte components if added.
- Keep code minimal and typed; prefer small, composable functions.

## Testing Guidelines
- Framework: Vitest.
- Tests live in `packages/*/test` and use `*.test.ts` naming.
- Run all tests: `pnpm test`.
- Add tests for new indicator math and resampling behavior.

## Commit & Pull Request Guidelines
- No strict commit message convention is enforced in this repo; keep commits concise and descriptive (e.g., "Add anchored VWAP indicator").
- PRs should include a brief summary of changes, relevant screenshots for UI changes, and any new environment variables.

## Configuration & Environment
- API env: `apps/api/.env` (see `apps/api/.env.example`).
- Web env: `apps/web/.env` (see `apps/web/.env.example`).
- Default `DATA_MODE=mock` uses local candles; `DATA_MODE=alpaca` requires Alpaca keys.
