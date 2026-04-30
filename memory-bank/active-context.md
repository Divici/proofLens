# Active Context

## Current phase

**Phase 5 — Build (autonomous per slice)** — slice 0001 (scaffold + dev
loop) merged into main. Slice 0002 (single-label happy path, LLM only)
queued for execution.

## Just completed

- **Slice 0001 (scaffold + dev loop)** merged. Next.js 16 + TS strict +
  Tailwind v4 + shadcn/ui (button, card, input, label, select, sonner) +
  Inter via `next/font`. `lib/env.ts` Zod-validates 5 OpenRouter env
  vars (with trailing-slash normalization on `OPENROUTER_BASE_URL`).
  `/api/health` returns `{ ok, providers: { openrouter }, ts }` with
  503-on-failure contract. `/about` server-rendered. Vitest + RTL +
  jsdom + MSW; Playwright smoke spec on `/`, `/about`, `/api/health`.
  GitHub Actions CI (typecheck/lint/test/e2e). `vercel.json` with
  framework: nextjs. Future-slice deps pinned in `package.json`.
  README + `.env.example` (names only).
- **Slice 0001 review nits** all addressed: env trailing-slash strip,
  health route try/catch contract, Playwright default port back to 3000
  (with `PORT=3210` documented as override).
- **Phase 0 (ALIGN)** — `ALIGNMENT.md` written (gitignored). Polished
  product with deployed URL deliverable. Auth removed (POC). Marcus IT
  note locked. Cadence picked: per-milestone (pause after 0003, 0005,
  0009).
- **Phase 1 (RESEARCH, greenfield mode)** — 4 parallel research agents
  produced `research-findings/01..04`; synthesized to `RESEARCH.md`.
  Canonical § 16.21 text captured verbatim. Tesseract.js chosen as
  gov-warning ground-truth source over AWS Textract per "OpenRouter only"
  preference. Verification logic locked: hybrid deterministic-first +
  LLM-judge gray band. Stack locked: Next.js 16 + TS + shadcn + IndexedDB
  + Web Worker pool + Vercel Hobby.
- **Phase 2 (ARCHITECT)** — `PRESEARCH.md` written. 22 R-IDs registered
  with phase coverage. 13-candidate slice list consolidated to 9.
- **Phase 3 (SLICE)** — 9 issue files + `issues/README.md` committed.
  Demoable milestones: 0003 (AI tracer), 0005 (reviewable), 0009 (full
  polished demo).
- **Phase 3.5 (FINAL REVIEW)** — CHECKPOINT 1 cleared. Cadence:
  per-milestone.

## Next

1. Finish Phase 4 bootstrap (this slice — non-issue, conductor-only).
2. Start Phase 5 build with slice 0001 (Scaffold + dev loop).
3. Per-milestone pauses after 0003, 0005, 0009.
4. Architecture audit (Phase 6) triggers after slice 0004 / 60% complete.
5. Eval (Phase 7) after slice 0009.
6. Sweep (Phase 8) after eval.
7. Deploy approval (Phase 9, CHECKPOINT 4).

## Open questions deferred to slice-implementation time

- Concrete IndexedDB key naming + index design (slice 0005)
- Concrete Zod schema layouts for ApplicationData / ExtractedLabelData
  (slice 0002)
- Image-quality heuristic thresholds — tune in slice 0004
- Tesseract worker init strategy — slice 0003
- Camera capture device-specific quirks discovered during slice 0006
- Real demo image sourcing (TTB COLA + Figma mocks) — slice 0009 final
  pass

## Provider configurations (env-var shape, not values)

- OpenRouter — required at runtime; primary/fallback/judge model names
  configurable
- Tesseract.js — in-process, no API key
- Langfuse — required at eval-time only; offline use only
