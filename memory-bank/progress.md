# Progress

## Done

- Phase 0 (ALIGN) — `ALIGNMENT.md` (gitignored) + cadence selection
- Phase 1 (RESEARCH) — `RESEARCH.md` + `research-findings/01..04` (committed)
- Phase 2 (ARCHITECT) — `PRESEARCH.md` (committed, LOCKED)
- Phase 3 (SLICE) — `issues/0001..0009` + README (committed)
- Phase 3.5 (CHECKPOINT 1) — cleared
- Phase 4 (BOOTSTRAP) — `.claude/`, `memory-bank/`, `decisions/0001` (committed `fc072de`)
- Phase 5 (BUILD) — slice 0001 merged. Scaffold + env validation + health route + Vitest/MSW/Playwright + CI + Vercel config. Vitest 10/10, Playwright 3/3, build green.
- Phase 5 (BUILD) — slice 0002 merged. Zod schemas (`ApplicationData`, `ExtractedLabelData`); hand-rolled OpenRouter vision client (Haiku 4.5, strict tool-use with `anyOf` nullables); sharp image preprocessor; stateless `/api/extract-label`; uploader + expected-data form + extracted-data card; `/review` page; demo scenario 01. Vitest 63/63, Playwright 4/4, build green.
- Phase 5 (BUILD) — **slice 0003 merged (AI tracer milestone)**. Tesseract.js wired in parallel with Claude Haiku; three-layer gov-warning matcher with CI mutation fuzz (100/100 rejected); ABV + net-contents strict matchers; nuanced ladder with `fuzzball` + gray-band routing; 8-state status engine with templated rule-sourced explanations; `/api/judge-field` endpoint (stateless, LRU-cached, NOT YET threaded into pipeline — gray band routes to Manual Review); bbox locator from Tesseract word positions; full UI overhaul (`VerificationDetail` replaces `ExtractedDataCard`, `LabelImagePreview` with SVG bbox overlay, `FieldRow` with click-to-highlight). Demo scenarios 03 (ABV mismatch) and 04 (gov-warning capitalization) added. Vitest 214/214, Playwright 7/7, build green. ADR 0002 captures architecture.

## Remaining (slice plan)

| # | Slice | Status | Effort |
|---|---|---|---|
| 0001 | Scaffold + dev loop | **Done** (merged) | 3-4h |
| 0002 | Single-label happy path (LLM only) | **Done** (merged) | 4-5h |
| 0003 | Verification + Tesseract + bbox highlights | **Done** (merged) — milestone | 8-10h |
| 0004 | Beverage rules + image quality | **Done** (merged) | 4-5h |
| 0005 | Override + IndexedDB history | **Done** (merged) — milestone | 5-6h |
| 0006 | Live camera capture | **Done** (merged) | 4-5h |
| 0007 | Batch flow + Web Worker pool | **Done** (merged) | 6-7h |
| 0008 | Exports (PDF + CSV + JSON) | **Done** (merged) | 4-5h |
| 0009 | Polish: demo + a11y + restricted-network + docs + deferrals | In-progress (final milestone — pause after) | 6-8h |

Total estimate: 43-53h of slice work + Phase 6 audit + Phase 7 eval +
Phase 8 sweep + Phase 9 deploy.

## Tests

- Test count: Vitest 537 / Playwright 20 (after slice 0008). Mutation fuzz at numRuns:100 with 0 slips. Lint warnings: 0.
- Goal at end of build: every R-ID has at least one passing test;
  gov-warning mutation fuzz harness with ≥100 generated mutations all
  rejected; Lighthouse a11y ≥ 95 on every route; verdict accuracy
  ≥ 95% on golden set.

## Known issues / risks

- Tesseract.js cold-start latency on Vercel — mitigated by health-ping
  warm-keep (slice 0009)
- Tab-close mid-batch → in-progress items reset; documented limitation
- Vercel Hobby ToS — acceptable for POC, flag if commercializing
- Vision-LLM gov-warning capitalization normalization — defended by
  Tesseract ground-truth + CI mutation fuzz
- IndexedDB quota with heavy demo use — quota-status banner at 80%

## Blockers

None.
