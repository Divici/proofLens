# proofLens

AI-powered alcohol-label verification for TTB compliance reviewers.

proofLens helps compliance agents verify that uploaded alcohol-label
artwork matches the expected application data. It extracts visible
label fields, compares them against TTB rules (27 CFR Parts 4, 5, and
7), flags issues with explanations and confidence, surfaces image-
quality problems, and supports human override and final decision.

## Status

Under construction. The product is being delivered as a sequence of
demoable vertical slices — see `issues/` for the slice plan and
acceptance criteria.

## Run locally

Prerequisites: **Node 20+** and **pnpm 10+**.

```bash
pnpm install
cp .env.example .env.local   # then fill in OPENROUTER_API_KEY
pnpm dev
```

The dev server runs on `http://localhost:3000` by default. Open
`/about` for project info or `/api/health` for provider reachability.

## Test

```bash
pnpm typecheck     # strict TypeScript with noUncheckedIndexedAccess
pnpm lint          # ESLint (next config)
pnpm test          # Vitest (unit + integration, jsdom + MSW)
pnpm test:e2e      # Playwright smoke (boots a dev server on :3000)
pnpm format:check  # Prettier
```

The e2e suite uses the `@playwright/test` runner and starts its own
Next.js dev server on the Next.js default port `3000`. If port 3000 is
occupied locally, run `PORT=3210 pnpm test:e2e` (or any free port). You
can also point at a deployed URL with `PLAYWRIGHT_BASE_URL`.

## Deploy

Production and preview environments live on **Vercel** (Hobby + Fluid
compute, default region `iad1`). The first deploy:

```bash
pnpm dlx vercel link        # link the local checkout to a project
pnpm dlx vercel env pull    # pull env vars into .env.local (optional)
pnpm dlx vercel deploy      # preview deploy
pnpm dlx vercel --prod      # production deploy
```

CI (`.github/workflows/ci.yml`) runs `typecheck`, `lint`, `test`, and
`e2e` on every push and pull request; the e2e job depends on the unit
job passing.

## Environment variables

All variables are listed in [`.env.example`](./.env.example). Required
at runtime:

- `OPENROUTER_API_KEY` — OpenRouter API key (server-only)
- `OPENROUTER_MODEL_PRIMARY` — primary extractor model
- `OPENROUTER_MODEL_FALLBACK` — fallback model used by the confidence
  gate (~20% of requests)
- `OPENROUTER_MODEL_JUDGE` — judge model used in the gray band of the
  nuanced verifier
- `OPENROUTER_BASE_URL` — OpenRouter base URL (default
  `https://openrouter.ai/api/v1`)

`lib/env.ts` validates these via `zod` at server-startup and fails
fast with a descriptive error if any are missing or empty. The module
is `import "server-only"` and must not be imported from client code.

## Architecture overview

- **App Router** — all routes under `app/`, no `pages/`
- **shadcn/ui** components under `components/ui/`
- **`lib/`** holds the pure verification, AI, OCR, storage, and worker
  modules; cross-module boundaries use Zod-validated schemas
- **No server-side user data** — review history persists to IndexedDB
  in the browser; server endpoints are stateless and ephemeral
- **OpenRouter** is the single LLM gateway; model names are env vars
  so providers can be swapped without code changes

See `memory-bank/` for the persistent project context and
`decisions/` for ADRs.

## Batch flow (`/batch`)

Drop a folder of label images plus a paired CSV (or JSON) describing
the expected `ApplicationData` per file. The UI pairs by filename
(case-insensitive, extension-agnostic) and processes up to 10 files in
parallel. A downloadable CSV template lives at `/api/template/csv`.

- Soft confirmation modal at **50 files** with cost+ETA estimate.
- Hard cap at **250 files**; over-cap drops surface a "Trim to 250"
  modal.
- Per-row live status, filterable by status / beverage / has-failures
  / overridden. Single-row + bulk **Retry all failed**.
- Once the batch finishes, the whole run + every per-row review saves
  to IndexedDB in a single transaction.

## Known limitations

- **Tab close mid-batch**: per-row results are buffered in memory and
  saved to IndexedDB only when the entire batch finishes. If the tab
  closes mid-run, completed-but-unsaved rows are lost. Keep the tab
  open for the duration of the batch (≈ 125 s for 250 files at the
  documented p50 latency).
- **No cross-device sync**: review history is per-browser. Export
  important reviews before clearing browser data.
- **No image previews in the queue table**: avoids holding 250 object
  URLs in memory. Open a row's detail modal to see the field-level
  verification.
