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
pnpm test:e2e      # Playwright smoke (boots a dev server on :3210)
pnpm format:check  # Prettier
```

The e2e suite uses the `@playwright/test` runner and starts its own
Next.js dev server on port `3210` so it doesn't collide with a local
`pnpm dev`. To use a custom port set `PORT` before running, or point
at a deployed URL with `PLAYWRIGHT_BASE_URL`.

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
