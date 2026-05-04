# proofLens

AI-powered alcohol-label verification web app for TTB compliance reviewers.
Polished, deployed live URL is the deliverable. Source-of-truth specs
(developer-local, gitignored): `PRD.md`, `PRESEARCH.md`, `RESEARCH.md`,
`research-findings/`, `memory-bank/`, `issues/`. Reviewer-facing
deliverable doc is `APPROACH.md`.

## Stack

- **Language:** TypeScript (strict, `noUncheckedIndexedAccess: true`)
- **Framework:** Next.js 16 (App Router) + React 19
- **UI:** shadcn/ui + Tailwind v4 + Inter
- **Package manager:** pnpm
- **AI gateway:** OpenRouter (Claude Haiku 4.5 primary, Sonnet 4.6 fallback)
- **OCR:** Tesseract.js — local-dev only (Vercel's bytecode runtime can't load it; production is LLM-only)
- **Persistence:** IndexedDB only (no server-side user data; per Marcus IT note)
- **Tests:** Vitest + RTL + fast-check + MSW + Playwright
- **Deploy:** Vercel Hobby + Fluid compute
- **Lint/format:** ESLint + Prettier (Tailwind plugin)

## Quality gates (must pass before merge)

`pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`

The gov-warning matcher mutation fuzz (`fast-check`) is part of `pnpm test`
and must pass — any regression fails the build.

## Modules

- `lib/ai/` — OpenRouter client, prompts, schemas
- `lib/ocr/` — Tesseract.js wrapper (local-dev only)
- `lib/verify/strict/` — gov-warning, ABV, net-contents (pure code)
- `lib/verify/nuanced/` — match-ladder + LLM-judge gray band
- `lib/verify/explain/` — templated rule-sourced explanations
- `lib/quality/` — image-quality heuristics
- `lib/storage/` — IndexedDB via `idb`
- `lib/workers/` — Web Worker pool for batch
- `lib/export/` — PDF / CSV / JSON / ZIP
- `lib/queue/` — mock COLA queue mapper (DEMO_SCENARIOS + REAL_SCENARIOS)

## Skills

This project uses the conductor + global user-level skills:

- `~/.claude/skills/conductor/` (workflow conductor)
- `~/.claude/skills/conductor/bundled/` (conductor-specific helpers)
- User rules: `commit-message`, `complete-product-default`, `forge-defaults`,
  `lightweight-decoupling`, `no-env-contents`, `study-guide`, `tdd`

## Project rules

- **No server-side user data.** Per Marcus IT note: "not storing anything
  sensitive for this exercise." Originals are always ephemeral; review
  history lives in IndexedDB. Server endpoints are stateless.
- **Strict gov-warning recall is non-negotiable.** The strict matcher
  enforces 27 CFR § 16.21 byte-for-byte against the LLM's verbatim
  capture. CI mutation fuzz at `numRuns:100` must pass — every
  regression fails the build.
- **TDD per `~/.claude/rules/tdd.md`.** Failing test first, every time.
- **Auto-commit per `~/.claude/rules/commit-message.md`** at the end of
  each task.
- **Forward-looking TTB rules (Notices 237/238) are out of scope.** Design
  strictly to today's regulations.
