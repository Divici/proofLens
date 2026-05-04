# proofLens

AI-powered alcohol-label verification for TTB compliance reviewers.

## Deliverables

- 🌐 **Live app:** <https://prooflens-ai.vercel.app/queue>
- 📦 **Source repo:** <https://github.com/Divici/proofLens>
- 📝 **Approach, tools, and assumptions:** [`APPROACH.md`](./APPROACH.md) — the brief's *"brief documentation"* deliverable
- 🧭 **Project brief (verbatim):** [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md)
- 🏗️ **Architecture deep-dive:** [`docs/architecture.md`](./docs/architecture.md)

## What it is

proofLens helps compliance agents verify that uploaded alcohol-label
artwork matches the expected application data. It extracts visible
label fields with a vision LLM (Claude Haiku 4.5 via OpenRouter), runs
the regulated government-warning check through Tesseract.js OCR for
strict 100%-recall verification, compares every field against TTB
rules (27 CFR Parts 4, 5, and 7), surfaces image-quality issues, and
supports human override + final decision.

## Problem statement

Compliance reviewers at TTB-equivalent regulators face a high-volume,
detail-sensitive task: every label must be checked against the
application's expected fields, and the regulatory `27 CFR § 16.21`
government-warning text must appear verbatim. Manual verification is
slow and easy to slip on capitalisation or punctuation drift; pure-LLM
verification is fast but silently normalises capitalisation away — the
exact failure mode the regulation cares about. proofLens is built for
this niche: an AI-assisted workflow with a deterministic safety net.

## Run locally

Prerequisites: **Node 20+** and **pnpm 10+**.

```bash
pnpm install
cp .env.example .env.local   # then fill in OPENROUTER_API_KEY
pnpm dev
```

The dev server runs on `http://localhost:3000` by default. Open `/`
to land in the **Queue** (the agent's home — see `PROJECT_BRIEF.md`),
`/review` for an ad-hoc single-label review, `/batch` for the bulk
flow, `/history` for saved reviews, `/settings` for the provider
allow-list, or `/api/health` for provider reachability.

## Test

```bash
pnpm typecheck     # strict TypeScript with noUncheckedIndexedAccess
pnpm lint          # ESLint (next config) — must be 0 warnings
pnpm test          # Vitest (unit + integration, jsdom + MSW)
pnpm test:e2e      # Playwright e2e (boots a Next.js dev server)
pnpm format:check  # Prettier
```

The e2e suite uses the `@playwright/test` runner and starts its own
Next.js dev server on the Next.js default port `3000`. If port 3000 is
occupied locally, run `PORT=3210 pnpm test:e2e` (or any free port).
You can also point at a deployed URL with `PLAYWRIGHT_BASE_URL`.

The gov-warning matcher mutation fuzz (`fast-check`) is part of `pnpm
test` and runs at `numRuns: 100` against 11 mutation categories.

## Deploy to Vercel Hobby

Production and preview environments live on **Vercel** (Hobby + Fluid
compute, default region `iad1`).

```bash
pnpm dlx vercel link        # link the local checkout to a project
pnpm dlx vercel env pull    # pull env vars into .env.local (optional)
pnpm dlx vercel deploy      # preview deploy
pnpm dlx vercel --prod      # production deploy
```

CI (`.github/workflows/ci.yml`) runs `typecheck`, `lint`, `test`, and
`e2e` on every push and pull request; the e2e job depends on the unit
job passing.

## How to use the app

1. Open the deployed URL (or `/`) — you land in the **Queue**, the
   list of pending applications. This mirrors the workflow described
   in `PROJECT_BRIEF.md` (Sarah Chen, Deputy Director): "an agent
   pulls up an application, looks at the label artwork, and checks
   that what's on the label matches what's in the application."
2. The queue mixes **synthetic** placeholder labels (`APP-2026-NNNN`)
   and **real bottle photos** (`APP-2026-RNNN`) including
   image-quality variants (front, angled, glare). Click a row →
   `/review?scenario=<id>` opens with both the artwork and the
   application form pre-loaded.
3. Click **Verify label**.
4. Review the per-field verdicts. Click any row to expand the
   per-field override panel.
5. Apply per-field overrides where you disagree with the AI (capture
   a reason — every override carries a timestamped audit note).
6. Pick a final decision (Approve / Reject / Manual Review / Request
   Better Image), enter your reviewer name, and **Save review**.
7. Saved reviews live under `/history` (browser-local). Open any row
   to reopen + edit + re-save. Once saved, the originating queue row
   shows a **Reviewed** pill (matched by `scenarioId` on the saved
   record).
8. **Export** a PDF audit report or a JSON snapshot from the review
   detail. From a saved batch, also Summary CSV / Per-field CSV /
   All PDFs (zip) / All JSON (zip).
9. **Manual entry is still supported.** Visit `/review` directly (no
   `?scenario=`) for an ad-hoc review — the uploader, expected-data
   form, and demo-scenario picker are all available. Bulk uploads
   live at `/batch` for Janet's "200, 300 at once" use case.

## AI / OCR approach

**Two extraction systems run in parallel** for every label
(`Promise.all`):

1. **Vision LLM** (Claude Haiku 4.5 via OpenRouter) — extracts
   structured fields (brand, class/type, ABV, net contents, bottler,
   country, government-warning region) with evidence quotes.
2. **Tesseract.js** (in-process) — produces raw text + word-level
   bounding boxes. Tesseract is the **ground truth source for the
   government-warning verbatim check**.

Fallback model (Claude Sonnet 4.6) is wired but called only when the
primary extractor reports low confidence. Today the routing emits
`fallbackUsd: 0` because the primary model handles every demo label
well; the schema and call path are stable for future activation.

## Verification approach

Hybrid deterministic-first (rationale in [`APPROACH.md`](./APPROACH.md)):

- **Strict fields** (gov-warning, ABV, net contents) flow through pure
  code with a CI mutation fuzz harness on the gov-warning matcher.
  These fields **cannot architecturally reach the LLM judge.**
- **Nuanced fields** (brand, class/type, bottler, country) flow
  through a typed match ladder: NFKC + smart-quote/dash fold + case
  fold + punctuation strip → `fuzzball.token_set_ratio` → 3-band
  decision. Gray band (0.78 ≤ similarity < 0.92) consults the LLM
  judge (Claude Haiku 4.5, dedicated tool-use prompt).
- **Status engine** maps `(matchStrength, aiConfidence,
  imageQualityPoor)` to the 8-state enum (Pass / Likely Match /
  Warning / Fail / Missing / Low Confidence / Manual Review /
  Not Required). Rung-1 byte-equality (post case + punctuation
  normalisation) and US-alias equivalence both render as **Pass** on
  the field-row pill — the audit-trail distinction is preserved via
  the `nuanced_pass_normalised` rule outcome (ADR 0010, Phase 2 of
  the full-review plan).
- **Templated explanations** are the audit-of-record. Every
  `RuleOutcome` kind has a registered template that surfaces both
  on-screen (FieldRow), in PDF exports (per-field sub-row), and in
  CSV exports (Explanation column). The LLM judge's prose is
  auxiliary.

## Human-in-the-loop workflow

- Per-field human override panel (Pass / Fail / Manual Review) with a
  required reason and an immutable record of the original AI verdict.
- Reviewer name is captured at the moment of override (not at save) so
  a single review can carry overrides from multiple reviewers.
- Final-decision panel (Approve / Reject / Manual Review / Request
  Better Image) with notes and timestamp. Save is gated on **both**
  reviewer name and a chosen decision.
- Reopening a saved review hydrates every state slot — image, expected
  data, field rows, overrides, decision, reviewer name — so an audit
  trail is editable until a human signs off.

## Batch flow (`/batch`)

Drop a folder of label images plus a paired CSV (or JSON) describing
the expected `ApplicationData` per file. The UI pairs by filename
(case-insensitive, extension-agnostic) and processes up to 10 files
in parallel via a main-thread pool with rate-limit pacing. A
downloadable CSV template lives at `/api/template/csv`.

- Soft confirmation modal at **50 files** with cost+ETA estimate.
- Hard cap at **250 files**; over-cap drops surface a "Trim to 250"
  modal.
- Per-row live status, filterable by status / beverage / has-failures
  / overridden. Single-row + bulk **Retry all failed**.
- Once the batch finishes, the whole run + every per-row review saves
  to IndexedDB in a single transaction.
- Mid-batch CSV / Per-field CSV exports are available off the live
  queue; PDF / ZIP exports require the batch to save first (they read
  the persisted thumbnail).

## Image quality handling

Per-image heuristics + LLM image-quality notes feed the same flag
list:

- **Blur** — Laplacian variance below threshold.
- **Glare** — extreme bright-pixel histogram skew.
- **Dark** — low mean luminance.

When at least one flag fires, **passing nuanced rows demote to Manual
Review with a Request Better Image action**, and a banner above the
results panel lists the flags and exposes the same action. Strict
fails (gov-warning, ABV) **never** salvage on quality flags — those
remain Fail because the regulation is verifiable without the AI's
help.

## Government-warning validation

The `GOVERNMENT WARNING:` text (27 CFR § 16.21) is a strict 100%-recall
target. Three-layer matcher:

1. **Prefix** — case-sensitive `text.startsWith("GOVERNMENT WARNING:")`.
2. **Body** — NFKC + smart-quote/dash collapse + Markdown strip +
   whitespace collapse → exact compare to canonical § 16.21.
3. **Damerau-Levenshtein distance** for the explanation prose so a
   single OCR drop on a stop-word doesn't strict-fail a clearly
   compliant label.

CI mutation fuzz (`fast-check`) generates 11 mutation categories and
asserts every mutation is rejected. Build fails if a regression slips.

## Data storage and privacy

**No server-side user data.** Per Marcus's IT note, "we are not storing
anything sensitive for this exercise":

- Uploaded images are processed in memory and discarded at the end of
  the request.
- All review history lives in **IndexedDB** in the reviewer's browser.
- Server endpoints (`/api/extract-label`, `/api/judge-field`,
  `/api/render-pdf`, `/api/health`, `/api/template/csv`) are stateless.
- A reviewer's free-text **Reviewer Name** is sticky across sessions
  in the local `settings` store, but it's an audit field — not an
  identity assertion.
- 80 % browser-quota threshold surfaces a non-blocking amber banner
  encouraging the reviewer to export and clear before adding more.

The `/settings` page exposes the read-only provider allow-list
(OpenRouter required, Tesseract.js in-process, Langfuse eval-only) and
the active rules version (`ttb-2026-04-30`).

## Architecture overview

- **Next.js 16** App Router + React 19 + TypeScript strict +
  Tailwind v4 + shadcn/ui + base-ui primitives.
- **`app/`** — routes (`/`, `/queue`, `/review`, `/batch`,
  `/history`, `/settings`, `/about`) and the stateless API endpoints
  under `app/api/`. `/` redirects to `/queue` (the agent's entry
  point per `PROJECT_BRIEF.md`).
- **`lib/`** — pure modules:
  - `lib/ai/` — OpenRouter client, prompts, schemas, judge call
  - `lib/ocr/` — Tesseract.js wrapper
  - `lib/verify/strict/` — gov-warning, ABV, net-contents matchers
  - `lib/verify/nuanced/` — match-ladder + LLM-judge gray band
  - `lib/verify/explain/` — templated rule-sourced explanations
  - `lib/quality/` — image-quality heuristics
  - `lib/storage/` — IndexedDB via `idb`
  - `lib/workers/` — main-thread extraction pool for batch
  - `lib/export/` — PDF / CSV / JSON / ZIP
  - `lib/queue/` — mock COLA queue mapper
    (`DEMO_SCENARIOS` + `REAL_SCENARIOS` → `QueuedApplication[]`)
  - `lib/demo/real-scenarios.ts` — Zod-validated loader for real
    bottle photos under `public/demo-labels/real/`
- **No server-side user data** — stateless endpoints, IndexedDB
  persistence in the browser.
- **OpenRouter** is the single LLM gateway; model names are env vars
  so providers can be swapped without code changes.

See [`APPROACH.md`](./APPROACH.md) for the brief's approach + tools +
assumptions deliverable, and [`docs/architecture.md`](./docs/architecture.md)
for a deeper walk-through.

## Environment variables

All variables are listed in [`.env.example`](./.env.example). Required
at runtime:

- `OPENROUTER_API_KEY` — OpenRouter API key (server-only)
- `OPENROUTER_MODEL_PRIMARY` — primary extractor model
- `OPENROUTER_MODEL_FALLBACK` — fallback model used by the confidence
  gate
- `OPENROUTER_MODEL_JUDGE` — judge model used in the gray band of the
  nuanced verifier
- `OPENROUTER_BASE_URL` — OpenRouter base URL (default
  `https://openrouter.ai/api/v1`)

`lib/env.ts` validates these via `zod` at server-startup and fails
fast with a descriptive error if any are missing or empty. The module
is `import "server-only"` and must not be imported from client code.

## Assumptions

- **TTB rules effective today.** Forward-looking notices (237/238) are
  out of scope.
- **Spirits ABV tolerance ±0.3 pp**, wine ±1.5 pp / ±1.0 pp by ABV
  band, malt ±0.3 pp. Per beverage-rules table.
- **Volume tolerance 0.1 %** on net-contents conversions (mL ↔ L ↔ cL
  ↔ fl oz).
- **Single-browser-tab** assumption — IndexedDB writes coordinate via
  IDB's own transaction guarantees, not via cross-tab signalling.
- **Reviewer trusted** — there's no auth surface, no role gating, no
  audit-log stripping. The IT note rules out server persistence; the
  audit is in the saved Review record itself.

## Tradeoffs

- **More moving parts than an LLM-only extractor.** Two extraction
  systems running in parallel + a verification pipeline + status
  engine + explanation render layer + judge endpoint. Justified by
  the 100%-recall constraint on the government-warning check.
- **Tesseract.js cold-start latency** ~0.5 s on first call after a
  Vercel function spin-up. Mitigated in production by a planned
  warm-keep cron at `/api/health`.
- **Per-tab batch state.** Closing the tab mid-run loses unsaved
  rows; saves are atomic at batch-completion. Acceptable for a POC,
  documented as a known limitation.
- **No LLM-narrative explanations.** Templated rule outcomes are the
  audit-of-record; LLM prose appears only on judge-decided rows.

## Known limitations

- **Tab close mid-batch.** Per-row results are buffered in memory and
  saved to IndexedDB only when the entire batch finishes. Keep the
  tab open for the duration of the batch (≈ 125 s for 250 files at
  the documented p50 latency).
- **No cross-device sync.** Review history is per-browser. Export
  important reviews before clearing browser data.
- **IndexedDB quota.** Above 80 % an amber banner appears; saves are
  still allowed (we never refuse a reviewer's audit record).
- **Vercel Hobby ToS.** Production use beyond the POC scale is out of
  scope; the architecture is cleanly portable to Pro / Enterprise.
- **`fallbackUsd` is currently always 0.** Plumbing is stable; the
  fallback model call path will activate once the confidence gate is
  threaded.
- **No bbox click-to-highlight on production.** Tesseract.js is
  disabled on Vercel (ADR 0007 — bytecode-runtime incompatibility),
  so word-level bboxes aren't available. The affordance was removed
  from the UI under the production-or-cut rule (ADR 0010); local-dev
  data still carries bboxes for forensic export.
- **Real TTB COLA bundle.** The demo bundle ships programmatic JPEG
  placeholders for all seven scenarios; sourcing license-clean real
  COLA artwork is a future improvement.
- **Country-of-origin and malt-beverage ABV evaluators default to Optional**: the form does not currently surface `isImported` or `addedFlavorsContributeAlcohol` flags. Reviewers can override the per-field result manually. (See `lib/verify/beverage-rules.ts`.)

## Future improvements

- Wire the fallback model call path end-to-end (today: schema +
  cost-tracking only).
- bbox fuzzy fallback (sliding-window 0.85 threshold) for OCR
  tokenization drift.
- LLM-narrative explanations on Manual Review rows.
- Real TTB COLA samples for the demo bundle (license-cleared from
  https://www.ttbonline.gov).
- `isImported` UI flag in the form so the country-of-origin
  evaluator can demand it instead of treating it as optional.
- Tesseract warm-keep cron at `/api/health` (every 5 minutes).
- Cross-device sync via opt-in cloud storage (out of scope under
  the IT note today).

## Skills + rules

This project uses the conductor + global user-level skills:

- `~/.claude/skills/conductor/` (workflow conductor)
- User rules: `commit-message`, `complete-product-default`,
  `forge-defaults`, `lightweight-decoupling`, `no-env-contents`,
  `study-guide`, `tdd`

## Project rules

- **No server-side user data.** Per Marcus IT note: originals are
  always ephemeral; review history lives in IndexedDB. Server
  endpoints are stateless.
- **Strict gov-warning recall is non-negotiable.** Tesseract.js (not
  the LLM) is the ground-truth source for the `27 CFR § 16.21`
  exact-match. CI mutation fuzz must pass.
- **TDD per `~/.claude/rules/tdd.md`.** Failing test first, every
  time.
- **Auto-commit per `~/.claude/rules/commit-message.md`** at the end
  of each task.
- **Forward-looking TTB rules (Notices 237/238) are out of scope.**
  Design strictly to today's regulations.
