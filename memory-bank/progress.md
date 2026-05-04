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
| 0009 | Polish: demo + a11y + restricted-network + docs + deferrals | **Done** (merged) — polished-demo milestone | 6-8h |

Total estimate: 43-53h of slice work + Phase 6 audit + Phase 7 eval +
Phase 8 sweep + Phase 9 deploy.

## Tests

- Test count: Vitest **645** / Playwright **26** chromium + **15**
  production-sim. Mutation fuzz at numRuns:100 with 0 slips.
  Typecheck/lint clean. E2E known-transient export-download race
  re-runs clean (one per full sweep). All 9 build slices merged +
  Phase 6 Cluster 1 refactor + Phase 7 Layer 1+Layer 2 evals + Phase
  8 schema-coercion fix + Phase 9 deploy + post-Phase-9 redesign +
  full-review plan Phases 1/6/2/5/7.

## Phase milestones

- Phase 5 BUILD complete (commit 60955ad)
- Phase 6 audit + Cluster 1 refactor (commit bf76631)
- Phase 7 Layer 1 deterministic eval — 37/37, 11/11 gov-warning recall
  (commits 906c13d, a7cd38a)
- Phase 7 Layer 2 live eval — schema-coercion fix lifted accuracy from
  0/23 → 13/23 (56.5%) and gov-warning recall to 11/11 (100%) (commit 8debc74)
- Phase 8 sweep complete — 1 critical issue fixed (schema coercion),
  1 minor cosmetic finding accepted as-is. Quality gates green.
- Phase 9 DEPLOY complete — live at https://prooflens-ai.vercel.app
  (commit bc2c3d0). Tesseract dropped on Vercel (ADR 0007) after 9
  documented fix attempts hit Vercel's bytecode runtime wall. Layer 2
  against the deployed instance: **11/11 (100%) gov-warning recall**,
  p50=5.7s / p95=7.3s (within p95 target), avg cost $0.0085/case.
  Production faster than local dev cold start.
- **Full-review plan (post-Phase-9 finalization, 2026-05-03).**
  8-phase audit at
  `memory-bank/plans/2026-05-03-full-review-and-finalize.md`.
  Phases shipped:
  - **Phase 1** (`9e85d16`) — production-or-cut: dead bbox UI cut,
    function-phrase scanner fixed for Vercel, pill vocab normalised,
    ADR 0010 added.
  - **Phase 6** (`c13fbe4`) — Vercel-sim test infrastructure: new
    `lib/verify/pipeline.production-env.test.ts` + `production-sim`
    playwright project (`pnpm test:e2e:prod-sim`).
  - **Phase 2** (`a49f78a`) — rung-1 promotion: new ladder kind
    `pass-normalised` + rule outcome kind `nuanced_pass_normalised`.
    Eval Layer 1 regenerated, 37/37 still green.
  - **Phase 5** (`b10fb1d`) — PDF/CSV explanation surfacing: PDF
    sub-row + CSV "Explanation" column carry the templated
    audit-of-record prose. New regression suite covers JSON
    round-trip + PDF/CSV visibility for every new RuleOutcome kind.
  - **Phase 7** (this commit) — docs reconciliation.
  Phases 3 (grader correctness eyes-on), 4 (UX/mobile/keyboard
  sweep), and 8 (eval re-run + final smoke) are queued.
- **Post-Phase-9 redesign — `/queue` is the new home (ADR 0008,
  2026-05-02).** Reflects the workflow described in `PROJECT_BRIEF.md`
  (Sarah Chen, Deputy Director): "an agent pulls up an application,
  looks at the label artwork, and checks that what's on the label
  matches what's in the application." The home now redirects to
  `/queue`, which lists pending applications mapped from
  `DEMO_SCENARIOS` (synthetic placeholder labels) and `REAL_SCENARIOS`
  (real bottle photos including image-quality variants — front,
  angled, glare). Clicking a row opens `/review?scenario=<id>` with
  both the image and the application form pre-loaded. Camera capture
  removed (brief is silent on it; Marcus's "our network blocks
  outbound traffic" further argues against device-API features). Nav
  reordered: Queue · Batch · History · Settings.
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
- Vision-LLM occasional bare-scalar tool-call response — coerced to
  structured shape with confidence:0 in lib/ai/openrouter.ts (Phase 8
  fix). Cases with bare-scalar fields route to manual review.
- IndexedDB quota with heavy demo use — quota-status banner at 80%
- Layer 2 latency p50/p95 over target by 22%/6% on cold pnpm dev. Re-
  measure post-deploy on Vercel Fluid compute (Phase 9).
- Layer 2 verdict expectations calibrated for Layer 1 mockExtraction;
  10 cases produce expected mismatches. Resolution path: split
  expectations or back cases with real bottle photos.

## Blockers

None.
