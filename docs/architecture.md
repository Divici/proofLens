# proofLens architecture

This document is a deeper walk-through of the proofLens architecture
than the README. It assumes familiarity with the [PRESEARCH.md](../PRESEARCH.md)
and [RESEARCH.md](../RESEARCH.md) phase documents and the
[`decisions/`](../decisions/) ADRs. Each section links back to the
authoritative source where decisions were locked.

## Source of truth

- [`PRD.md`](../PRD.md) — product spec (input)
- [`PRESEARCH.md`](../PRESEARCH.md) — Phase 2 architecture lock
- [`RESEARCH.md`](../RESEARCH.md) — Phase 1 brief
- [`decisions/`](../decisions/) — ADRs per major architectural choice
- [`research-findings/`](../research-findings/) — Phase 1 deep dives

## Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
  strict (`noUncheckedIndexedAccess: true`)
- **UI**: shadcn/ui + base-ui primitives + Tailwind v4 + Inter
- **AI gateway**: OpenRouter — Claude Haiku 4.5 (primary), Sonnet 4.6
  (fallback), Haiku 4.5 (judge)
- **OCR**: Tesseract.js in-process (gov-warning ground-truth)
- **Persistence**: IndexedDB only via `idb` (no server-side user data)
- **Tests**: Vitest + RTL + fast-check + MSW + Playwright
- **Deploy**: Vercel Hobby + Fluid compute

## End-to-end request flow (single label)

```
[browser]                                 [server]
  ┌──────────────┐
  │ /review page │
  └──────┬───────┘
         │ multipart POST
         ▼
  ┌────────────────────────┐    ┌─────────────────────────┐
  │ POST /api/extract-label│───▶│ preprocess (sharp)      │
  │   - image (Blob)       │    │   autorotate + ≤ 2 MP   │
  │   - expected (JSON)    │    └────────────┬────────────┘
  └────────────────────────┘                 │
                                             ▼
                          ┌──────────────────────────────────┐
                          │ Promise.all([                    │
                          │   extractLabel (LLM),             │
                          │   tesseractExtract (OCR)          │
                          │ ])                                │
                          └────────────┬─────────────────────┘
                                       ▼
                          ┌──────────────────────────────────┐
                          │ analyzeImageQuality (heuristic    │
                          │   + LLM-notes parser)             │
                          └────────────┬─────────────────────┘
                                       ▼
                          ┌──────────────────────────────────┐
                          │ runVerificationPipeline:          │
                          │   per field → strict OR nuanced   │
                          │   gray-band → callJudge upstream  │
                          │   status engine → 8-state enum    │
                          │   templated explanations          │
                          │   bbox locator (OCR words)        │
                          └────────────┬─────────────────────┘
                                       ▼
                          ┌──────────────────────────────────┐
                          │ JSON 200 with FieldResult[],     │
                          │ overall, processingTimeMs,       │
                          │ aiSpend, ocrConfidence, image    │
                          │ dimensions, image-quality flags  │
                          └────────────┬─────────────────────┘
                                       ▼
  ┌──────────────────────────────────────────────────────────┐
  │ /review hydrates VerificationDetail; bbox overlay scaled │
  │ to image dims; reviewer applies overrides; final         │
  │ decision; composeReview(...) → IndexedDB.put             │
  └──────────────────────────────────────────────────────────┘
```

Key invariants:

- The original image **never persists** server-side or client-side.
  Only the 256-px JPEG thumbnail is stored on the saved Review.
- Strict matchers operate on Tesseract's `rawText`, not the LLM's
  reading, so vision-LLM capitalisation normalisation can't pass a
  failing gov-warning.
- The judge upstream call runs only inside the nuanced ladder's gray
  band; strict fields cannot architecturally reach it.

## Module map

| Path | Responsibility |
|---|---|
| `lib/ai/openrouter.ts` | OpenRouter chat-completions client + fallback path |
| `lib/ai/judge-call.ts` | Server-side judge invocation (shared by route + pipeline) |
| `lib/ai/prompts/` | Locked extraction + judge prompts |
| `lib/ai/schema.ts` | Zod schemas for `ApplicationData`, `ExtractedLabelData` |
| `lib/ocr/tesseract.ts` | Tesseract.js wrapper, word-level bbox |
| `lib/verify/strict/` | gov-warning, ABV, net-contents matchers |
| `lib/verify/nuanced/` | match-ladder + per-field wrappers |
| `lib/verify/explain/` | rule outcome → templated explanation |
| `lib/verify/status-engine.ts` | 2-D matrix → 8-state status |
| `lib/verify/pipeline.ts` | orchestration |
| `lib/verify/beverage-rules.ts` | per-beverage requirement table |
| `lib/quality/` | Laplacian + luminance + histogram heuristics |
| `lib/storage/db.ts` | `idb` open + schema |
| `lib/storage/types.ts` | Review / Batch / Setting interfaces, rules version |
| `lib/storage/compose-review.ts` | Pure helper that builds a Review record |
| `lib/storage/review-repo.ts` | CRUD + hasOverrides helper |
| `lib/storage/batch-repo.ts` | Save batch + reviews atomically |
| `lib/storage/quota.ts` | `navigator.storage.estimate` wrapper |
| `lib/storage/settings-repo.ts` | Reviewer-name sticky setting |
| `lib/workers/extraction-pool.ts` | Main-thread bottleneck pool |
| `lib/export/pdf/` | `@react-pdf/renderer` template + wire |
| `lib/export/csv/` | summary + per-field CSV |
| `lib/export/json/` | single + batch JSON envelopes |
| `lib/export/zip/browser.ts` | Stored (level-0) ZIP writer |
| `lib/export/client.ts` | Browser glue + download trigger |
| `lib/queue/applications.ts` | Mock COLA queue mapper (DEMO_SCENARIOS + REAL_SCENARIOS → QueuedApplication[]) |
| `lib/demo/scenarios.ts` | Bundled synthetic demo scenarios + batch manifest |
| `lib/demo/real-scenarios.ts` | Real bottle photos loaded from `public/demo-labels/real/manifest.json` |
| `lib/bbox/locate.ts` | Find OCR words matching an evidence quote |

## Server endpoints (stateless)

| Route | Method | Purpose |
|---|---|---|
| `/api/extract-label` | POST | Label extraction + verification |
| `/api/judge-field` | POST | Gray-band judge tie-breaker (also reachable directly) |
| `/api/render-pdf` | POST | Render a Review → PDF buffer |
| `/api/template/csv` | GET | Download the batch-template CSV |
| `/api/health` | GET | Provider reachability for `/settings` + smoke tests |

Every endpoint is `runtime: 'nodejs'`, validates env via Zod at the
top of the handler, and refuses to run if `OPENROUTER_API_KEY` is
missing.

## IndexedDB schema (`prooflens` database)

| Store | Key | Purpose |
|---|---|---|
| `review` | uuid | One record per completed review (with embedded thumbnail Blob) |
| `batch` | uuid | One record per batch run (links to `review.id` list) |
| `demoData` | scenarioId | Cached demo bundles (future-proofed) |
| `settings` | key | Sticky reviewer name, future preferences |

Schema details live in
[`lib/storage/types.ts`](../lib/storage/types.ts) and PRESEARCH §8.1.
The current rules version is `ttb-2026-04-30`; new ruleset slugs are
appended as Notices 237/238 land.

## Verification pipeline

See [`decisions.md` (ADR 0002 — verification pipeline architecture)](../decisions.md#0002-verification-pipeline-architecture)
for the full architecture lock. Summary:

- **Strict (gov-warning, ABV, net-contents)**: pure code, CI mutation
  fuzz on gov-warning. No LLM judge.
- **Nuanced (brand, class/type, bottler, country)**: NFKC + smart
  quote/dash fold + case fold + token-set ratio. Three-band decision:
  ≥ 0.92 → Pass / Likely Match, 0.78–0.92 → judge, < 0.78 → Fail.
- **Status engine**: 2-D matrix `(matchStrength, aiConfidence)`
  parameterised by `imageQualityPoor` → 8-state enum.
- **Explanations**: templated, one entry per `RuleOutcome` kind.

## Image quality

Three heuristics:

1. **Blur** — Laplacian variance below threshold.
2. **Glare** — extreme bright-pixel histogram skew.
3. **Dark** — low mean luminance.

LLM `imageQualityNotes` strings are parsed via a small regex matcher
and merged into the same flag list. When the merged set is
non-empty, `imageQualityPoor === true` is threaded into the status
engine and demotes passing nuanced rows to Manual Review with a
Request Better Image action. Strict fields **never** salvage on
quality flags.

## Override audit trail

Every overridden field carries a `humanOverride` object:

```ts
{
  originalAiStatus: FieldStatus;   // immutable record of what the AI said
  humanStatus: FieldStatus;         // what the reviewer decided
  reason: string;                   // ≤ 500 chars
  timestamp: ISO8601;
  reviewerName: string;             // captured at the moment of override
}
```

Re-affirming the AI's verdict (`humanStatus === originalAiStatus`)
with a note is allowed and produces a real audit signal — the
"reviewer manually confirmed Pass after a zoom" case.

## Rules version

Every saved Review carries `rulesVersion` (currently
`ttb-2026-04-30`). Exports embed the version slug; the PDF footer
derives the verification date from the slug so the audit footer
tracks the ruleset each review was verified against.

## Test coverage

- Unit/integration: 553 Vitest tests (slice 0009 baseline). Targets
  every pure module + every component renderer.
- Mutation fuzz: `test/fixtures/mutations/gov-warning-mutations.ts`
  generates 11 mutation categories at `numRuns: 100` per category.
  CI fails if any mutation passes the matcher.
- E2E: 22 Playwright specs across 7 files. Stubs `/api/extract-label`
  at the network boundary so tests don't depend on OpenRouter /
  Tesseract while still exercising IndexedDB end-to-end. Includes a
  keyboard-only spec covering the full single-label flow with zero
  mouse events.
- A11y: Lighthouse a11y target ≥ 95 on every route. Status indicators
  always combine colour + icon + text.

## Deferred items / future work

See the README "Future improvements" section. Tracked in:

- `decisions/0002` "Deferred" section
- `decisions/0003` "Deferred" section
- Slice plans under `memory-bank/plans/`
