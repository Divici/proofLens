# proofLens — Decision Log

> Consolidated architecture decision records. Every architectural
> turn the project took — Phase 0 bootstrap through the post-Phase-9
> finalization plan — lives here. Earlier versions kept one file per
> ADR under `decisions/`; consolidated into this single doc on
> 2026-05-04. Re-run `scripts/consolidate-decisions.mjs` if new
> ADRs land.

## Table of contents

- [0001: Conductor Bootstrap](#0001-conductor-bootstrap)
- [0002: Verification Pipeline Architecture](#0002-verification-pipeline-architecture)
- [0003: IndexedDB persistence + override audit trail](#0003-indexeddb-persistence-override-audit-trail)
- [0004: Camera capture + permissions state machine](#0004-camera-capture-permissions-state-machine)
- [0005: Batch flow + main-thread extraction pool](#0005-batch-flow-main-thread-extraction-pool)
- [0006: Export pipeline + browser-side PKZIP writer](#0006-export-pipeline-browser-side-pkzip-writer)
- [ADR 0007 — OCR strategy: Tesseract local-only, LLM-fallback on Vercel](#adr-0007-ocr-strategy-tesseract-local-only-llm-fallback-on-vercel)
- [0008: Queue page + design language adoption](#0008-queue-page-design-language-adoption)
- [0009: Grader audit — alignment, warnings, and deferrals](#0009-grader-audit-alignment-warnings-and-deferrals)
- [0010: Production-or-cut rule — no half-features](#0010-production-or-cut-rule-no-half-features)

---

## 0001: Conductor Bootstrap

**Date:** 2026-04-30
**Status:** accepted

### Context

Setting up project infrastructure for proofLens via the conductor.
proofLens is an AI-powered alcohol-label verification web app for TTB
compliance reviewers, targeting a deployed live URL. Source-of-truth
specs are `PRD.md` (input), `ALIGNMENT.md` (gitignored, Phase 0),
`PRESEARCH.md` (Phase 2 lock), `RESEARCH.md` (Phase 1 brief), and
`issues/0001..0009` (Phase 3 vertical slices).

### Decision

- **Workflow:** Conductor-driven build (`~/.claude/skills/conductor/`).
- **Stack:** Next.js 16 + TypeScript strict + Tailwind v4 + shadcn/ui +
  pnpm.
- **AI gateway:** OpenRouter; Claude Haiku 4.5 primary, Sonnet 4.6
  fallback, Haiku judge.
- **OCR:** Tesseract.js in-process (gov-warning ground truth — defends
  100%-recall requirement against vision-LLM caps normalization).
- **Persistence:** IndexedDB only. No server-side user data, no auth.
  Per Marcus IT note: "not storing anything sensitive for this exercise."
- **Quality gates:** `pnpm typecheck && pnpm lint && pnpm test &&
  pnpm test:e2e`. CI mutation fuzz on the gov-warning matcher
  (`fast-check`) is part of `pnpm test`.
- **Memory bank:** 6-file persistence in `memory-bank/`
  (project-brief, product-context, system-patterns, tech-context,
  active-context, progress).
- **Decision log:** `decisions/` ADR folder, generated via
  `architecture-decision-records` skill at slice boundaries.
- **Directory choice:** Standard (`memory-bank/` + `decisions/`).
- **TDD:** mandatory (`~/.claude/rules/tdd.md`).
- **Worktree isolation:** yes — slice agents work in worktrees per
  `superpowers:using-git-worktrees`.
- **Auto-commit:** mandatory at end of task
  (`~/.claude/rules/commit-message.md`).
- **Build cadence:** per-milestone — pause after slices 0003, 0005,
  0009.
- **Deployment:** Vercel Hobby + Fluid compute.

### Consequences

- The conductor's autonomous build flow handles end-to-end scaffold →
  build → audit → eval → sweep → deploy with three milestone pauses.
- Knowledge persists across sessions via the memory bank.
- Architectural decisions are traceable via ADRs in `decisions/`.
- Worktree isolation lets parallel slice agents work without
  interfering with each other or the user's main checkout.
- Quality gates are enforced automatically via CI and the conductor's
  per-slice review step (fresh `code-reviewer` agent in clean context
  per slice).
- The IT-note constraint (no server-side user data) drops a substantial
  chunk of typical Next.js infrastructure (DB, ORM, auth, object
  storage, queue) from the build. The simpler stack is intentional, not
  underbuilt.
- Following `forge-defaults` baseline keeps the surface familiar to
  future maintainers; only deviations from defaults are justified
  here.

### References

- `PRD.md`, `ALIGNMENT.md` (gitignored, local working doc),
  `PRESEARCH.md`, `RESEARCH.md`
- `research-findings/01-ttb-regulatory.md` through `04-architecture-infra.md`
- `issues/0001-scaffold-and-dev-loop.md` through `0009-polish-and-docs.md`
- `issues/README.md` (slice DAG and milestones)
- `~/.claude/rules/*.md`

---

## 0002: Verification Pipeline Architecture

**Date:** 2026-04-30
**Status:** accepted
**Slice:** 0003 (AI tracer milestone)

### Context

proofLens needs to extract structured fields from alcohol-label images,
compare each field against expected application data, and assign a
status drawn from an 8-state enum (Pass / Likely Match / Warning /
Fail / Missing / Low Confidence / Needs Manual Review / Not Required).
The hard constraint from PRESEARCH.md and ALIGNMENT.md is **100%
recall on government-warning strict-fail** — zero missed
capitalization, missing-prefix, or modified-text cases — while still
handling nuanced fields where minor differences (capitalization,
punctuation, smart quotes) should produce "Likely Match" rather than
"Fail."

The Phase 1 research (`research-findings/03-verification-logic.md`)
recommended a **hybrid deterministic-first** pattern: strict fields
flow through pure code with a CI mutation fuzz harness; nuanced fields
flow through a typed match-ladder with an LLM-judge gating only the
configured "gray band" of similarity scores. This ADR records the
implementation as it landed in slice 0003.

### Decision

#### Pipeline shape

```
extracted FieldResult[]   expected ApplicationData
         └──── field router ────┘
                   │
       ┌───────────┴───────────┐
       ▼                       ▼
   STRICT (gov-warning,    NUANCED (brand,
   ABV, net-contents)      class, bottler,
       │                   country)
   pure code,                  │
   no LLM-judge,           match ladder
   CI mutation fuzz        + LLM-judge in
   on gov-warning          0.78–0.92 band
       │                       │
       └─── status engine ─────┘
                   │
            explanation render
                   │
              FieldResult
```

#### Strict matchers (`lib/verify/strict/`)

- **Government warning**: three layers
  1. Prefix (case-sensitive `text.startsWith("GOVERNMENT WARNING:")`)
  2. Body (NFKC + smart-quote/dash collapse + Markdown strip +
     whitespace collapse → exact compare to canonical § 16.21)
  3. Damerau-Levenshtein distance for the explanation prose
- **ABV**: hand-rolled regex parser handles `45% Alc./Vol.`, `45% ABV`,
  `Alcohol 45% by Volume`, `90 Proof` (proof ÷ 2 = ABV). This slice
  ships spirits ±0.3 pp tolerance only; wine and malt tolerances land
  in slice 0004 with beverage-aware routing.
- **Net contents**: `convert-units` converts mL ↔ L ↔ cL ↔ fl oz with
  a 0.1% tolerance.

Strict fields **cannot architecturally reach the LLM-judge** — only
the nuanced ladder calls `callJudge` (and only inside the gray band).

#### Nuanced ladder (`lib/verify/nuanced/`)

```
strip case → strip punct → NFKC → fuzzball.token_set_ratio →
  ≥ 92  → Pass (Likely Match if not byte-equal)
  0.78–0.92 → callJudge() → status from judge (cached per session)
  < 0.78 → Fail (or Manual Review if confidence low)
```

Per-field wrappers (`brand.ts`, `class-type.ts`, `bottler.ts`,
`country.ts`) configure thresholds and explanation field-name labels.
Country-of-origin includes a small alias table (e.g. "USA" ≡ "United
States of America" ≡ "U.S.").

#### LLM-judge endpoint (`/api/judge-field`)

Stateless POST with module-scoped LRU cache keyed on
`(extracted, expected, fieldName)`. Strict tool-use schema returns
`{ result: 'equivalent' | 'not_equivalent' | 'uncertain', reasoning }`.

**Important caveat shipped in slice 0003:** the endpoint exists, the
prompt is locked, and the cache is unit-tested — but the call site
inside `runVerificationPipeline` is not yet threaded. Gray-band cases
route to "Manual Review" until a follow-up commit (planned for slice
0009) flips the switch. This was an explicit deferral noted in the
slice spec.

#### Status engine (`lib/verify/status-engine.ts`)

Pure function from `(matchStrength, aiConfidence, imageQualityPoor)`
to the 8-state enum. Strict cells collapse to
`{Pass, Fail, Missing, Low Confidence}` — no "Likely Match" on a
strict check. The `imageQualityPoor` parameter is wired but currently
ignored; it becomes the override hook in slice 0004.

#### Explanations (`lib/verify/explain/`)

Templated rule-sourced explanations are the audit-of-record. Every
`RuleOutcome` kind (19 in this slice) has a registered template.
Optional LLM-narrative explanation on Manual-Review rows is a future
enhancement (the templates can carry a `narrativeExplanation` field
when wired).

#### CI mutation fuzz harness

`test/fixtures/mutations/gov-warning-mutations.ts` defines
`fast-check` generators for 11 mutation categories (cap drop on
prefix, comma drops, word substitution, sentence reorder, smart-quote
injection, prefix lowercase / title-case / missing, char-insert,
char-delete, trailing extras). The test asserts every mutation is
rejected at `numRuns: 100`. Build fails if any mutation passes.

This is the safety net for the 100%-recall constraint.

#### Tesseract.js as ground truth

Tesseract runs **in parallel** with the LLM (`Promise.all`) on every
label. Tesseract supplies the raw text + word-level bboxes + the
gov-warning ground truth (cropped paragraph). The LLM never
transcribes the gov-warning text — it only locates the warning
region; the strict matcher operates on Tesseract's output.

This defends against the documented vision-LLM behavior of silently
normalizing capitalization on the warning paragraph (research-finding
that justified bringing in an OCR sidecar).

#### bbox highlights (`lib/bbox/locate.ts`)

For each field, `locate(evidenceQuote, words): Polygon | null`
finds the LLM's `evidenceQuote` in Tesseract's word stream and
returns the union polygon of matching words. Slice 0003 ships
exact-match only; fuzzy fallback (sliding window with 0.85 threshold)
is a documented TODO for slice 0009.

`pickGovWarningCandidate` provides a fallback that scans for the
literal `GOVERNMENT WARNING` prefix when exact-quote-match fails;
this mitigates OCR-tokenization differences on the strict path.

#### UI overhaul

- `components/VerificationDetail.tsx` replaces the previous
  `ExtractedDataCard`. Two-pane layout: image preview (with overlay)
  on the left, field results table + overall verdict panel on the
  right.
- `components/LabelImagePreview.tsx` renders the image with an SVG
  bbox polygon overlay scaled to the image dimensions.
- `components/FieldRow.tsx` per-field row with status badge (color +
  icon + lucide-react glyph + text label — never color-only),
  expandable explanation, click-to-highlight bbox.

### Consequences

#### Positive

- **100%-recall on government-warning strict-fail is testable and
  enforced in CI.** Build fails the moment a regression slips past
  the matcher.
- **Strict fields are architecturally precluded from LLM-judge**, so
  the "LLM normalized our compliance check away" failure mode is
  closed off.
- **Tesseract sidecar gives us word-level bboxes for free**, which
  feeds the click-to-highlight bbox UI without a separate OCR pass.
- **Templated explanations are audit-of-record** — every status has a
  deterministic, reviewable rationale string. LLM narrative is
  optional and clearly secondary.
- **The pipeline is purely-functional** below the route handler,
  making per-rule unit tests cheap and the property-based mutation
  fuzz easy to extend.

#### Negative

- **More moving parts than an LLM-only extraction.** Two extraction
  systems running in parallel, a verification pipeline, a status
  engine, an explanation render layer, and a separate judge endpoint.
  The complexity is justified by the 100%-recall constraint, but it
  shows up as ~5,000 LOC in this slice.
- **Tesseract.js cold-start latency** — first call after a Vercel
  function instance spin-up adds ~0.5 s. Mitigated by a planned
  warm-keep cron in slice 0009.
- **LLM-judge endpoint is wired but not called from the pipeline.**
  Gray-band cases route to "Manual Review" until slice 0009 threads
  the call. This was an explicit deferral in the slice plan, but
  it's a known gap — until then, a brand like `Stone's Throw` vs
  `STONE'S THROW` produces "Manual Review" instead of "Likely Match"
  in the rare case where the deterministic ladder lands in the gray
  band.

#### Deferred to later slices

- Image-quality override (slice 0004) — `imageQualityPoor` param
  exists in the status engine but is currently unused.
- Wine and malt ABV tolerances (slice 0004) — only spirits ±0.3 pp
  ships in 0003.
- LLM-judge call wiring (slice 0009) — see above.
- bbox fuzzy fallback (slice 0009) — exact match only today.
- Live LLM-narrative explanations (post-MVP enhancement).

### References

- `research-findings/01-ttb-regulatory.md` — § 16.21 canonical text
  and per-beverage rules
- `research-findings/03-verification-logic.md` — pattern recommendation
- `PRESEARCH.md` §6 — verification strategy lock
- `issues/0003-verification-tesseract-bbox.md` — slice spec
- `memory-bank/plans/slice-3-detail.md` — execution plan
- `lib/verify/strict/gov-warning-canonical.ts` — verbatim canonical
- `lib/verify/strict/gov-warning.ts` — three-layer matcher
- `test/fixtures/mutations/gov-warning-mutations.ts` — mutation
  generators
- `lib/verify/pipeline.ts` — orchestration
- `lib/verify/status-engine.ts` — 2-D matrix → 8-state enum
- `app/api/judge-field/route.ts` — gray-band judge endpoint

---

## 0003: IndexedDB persistence + override audit trail

**Date:** 2026-04-30
**Status:** accepted
**Slice:** 0005 (reviewable milestone)

### Context

Marcus's IT note (locked in `ALIGNMENT.md`): "not storing anything
sensitive for this exercise." This drove Phase 2's pivot from Better
Auth + Neon Postgres + Cloudflare R2 to **browser-local persistence
only**. Slice 0005 ships that persistence layer + the per-field
override + final-decision UI that turns proofLens into a usable
end-to-end review tool.

The core question this ADR records: how do we keep the audit trail
trustworthy when nothing is persisted server-side?

### Decision

#### Storage: IndexedDB via `idb`

`lib/storage/db.ts` opens a single `prooflens` database with four
stores:

| Store | Key | Purpose |
|---|---|---|
| `review` | uuid | One record per completed review, with embedded thumbnail (256px JPEG Blob) |
| `batch` | uuid | Slice-0007 forward; scaffolded today |
| `demoData` | scenarioId | Cached demo bundles for offline use |
| `settings` | key | Sticky `reviewerName`, future user preferences |

`idb` was chosen over raw IndexedDB for typed cursors and transaction
ergonomics; over Dexie for bundle size; over a custom wrapper for
maintainability. The wrapper is ~50 LOC.

#### Schema (matches `PRESEARCH.md` §8.1)

```ts
interface Review {
  id: string;                       // uuid
  createdAt: ISO8601;
  reviewerName: string;             // free-text input, audit field, NOT identity
  beverageType: 'beer' | 'wine' | 'spirits' | 'unknown';
  rulesVersion: 'ttb-2026-04-30';
  expectedData: ApplicationData;
  extracted: ExtractedLabelData;
  fieldResults: FieldResult[];      // each may carry humanOverride
  overall: OverallStatus;
  imageQualityFlags: ImageQualityFlag[];
  thumbnail: Blob;                  // 256px JPEG
  bboxes: Record<FieldName, BboxPolygon[]>;
  rawText: string;
  decision: HumanDecision | undefined;
  processingTimeMs: number;
  ocrConfidence: number;            // added in nit fix-ups
  imageWidth: number;               // added in nit fix-ups (for bbox scaling on reopen)
  imageHeight: number;              // added in nit fix-ups
  aiSpend: { primaryUsd: number; fallbackUsd: number };
}
```

The fix-up pass added `ocrConfidence`, `imageWidth`, `imageHeight` so
reopened reviews don't lie about confidence and bbox overlay scales
correctly.

#### Override audit trail

Every field that's overridden carries a `humanOverride` object with
five non-optional fields:

```ts
interface HumanOverride {
  originalAiStatus: FieldStatus;    // immutable record of what the AI said
  humanStatus: FieldStatus;          // what the reviewer decided
  reason: string;                    // ≤ 500 chars
  timestamp: ISO8601;
  reviewerName: string;              // captured at the moment of override, not at save
}
```

Both AI status and human status are preserved separately. A reviewer
can re-affirm the AI's verdict (set `humanStatus === originalAiStatus`)
with a note — that's a real audit signal in compliance work, e.g.
"Confirmed Pass after manual zoom on the gov-warning bbox."

The earlier `canSave` gate that required `humanStatus !==
originalAiStatus` was removed in the fix-up pass for this reason.

#### Final decision

`HumanDecision` carries `decision`, `notes`, `reviewerName`,
`timestamp`. Save is gated on **both** reviewer name AND a chosen
decision being non-empty. Reviewer name is sticky across sessions in
the `settings` store.

#### Composing reviews — pure helper for testability

`composeReview` in `lib/storage/compose-review.ts` takes the AI extraction
output, expected data, and the chosen decision; injects `id` and `now()`
as parameters; returns a fully-typed `Review`. The page-level call site
passes `crypto.randomUUID()` and `() => new Date()`. Pure inputs/outputs
make tests deterministic without mocking globals.

#### Save flow

```
[reviewer clicks Save]
  ↓
Generate 256px JPEG thumbnail via canvas
  ↓
composeReview(...) → Review
  ↓
db.review.put(review)
  ↓
db.settings.put({ key: "reviewerName", value: ... })
  ↓
[toast: "Review saved to local history"]
```

Quota check (via `navigator.storage.estimate()`) runs on `/review`
mount and on `/history` mount. Above 80% utilization, an amber banner
warns "History is nearly full — export and clear before adding more"
but **save is non-blocking** — we never refuse the user's audit
record.

#### History page

`/history` renders newest-first. Search by brand or reviewer name (UI
state debounced via `useDeferredValue`). Filter by overall status,
beverage type, has-overrides. Click a row → `/review?reviewId=<uuid>`.
Empty state distinguished from no-matches state.

The earlier `searchReviews` repo helper was deleted in the fix-up pass:
filtering happens in-memory in `ReviewHistoryList` over the loaded
review list. Two parallel filter implementations would drift; for POC
scale, in-memory is fine. If scale grows, slice 0009 can re-introduce
indexed lookups.

#### Reopen flow

`/review?reviewId=<uuid>` reads from `db.review`, hydrates the page
state from the persisted Review (thumbnail → object URL via `useEffect`
with cleanup, expectedData → form, fieldResults → VerificationDetail,
overall → verdict pill). The reviewer can apply additional overrides
or change the final decision and save again.

`URL.createObjectURL` on the reopened thumbnail is revoked on unmount
or on review change to prevent blob-URL leaks. (Initial slice
implementation missed this; fix-up added it.)

#### Server endpoints stay stateless

`/api/extract-label` and `/api/judge-field` persist nothing. Slice 0005
adds zero server-side persistence. The IT note is honored.

### Consequences

#### Positive

- **Honest with Marcus's IT note.** Zero server-side user data. The
  README can truthfully say "uploaded images are processed in memory
  and discarded; review records live only in your browser."
- **Audit trail is reviewer-scoped without identity.** Free-text
  reviewer name + timestamp + reason captured at every override.
  Compliance reviewers care about who-decided-what; they don't need
  identity assertion for an internal POC.
- **Reopen + edit + re-save** works end-to-end.
- **Thumbnails embedded in records** — history list renders without
  external storage.
- **Deferred search** — `useDeferredValue` keeps the input snappy as
  history grows.
- **Browser-local quota awareness** — non-blocking 80% banner sets
  expectations before reviewers hit the wall.

#### Negative

- **No cross-device sync.** Reviewer who starts a review on desktop
  can't finish on phone. Documented in README as a known limitation.
- **Browser-data clear wipes history.** Reviewers should export to PDF
  / CSV / JSON (slice 0008) before clearing browser data.
- **Single-browser-tab assumption.** Two tabs writing to the same
  IndexedDB don't coordinate beyond IDB's own transaction guarantees.
  Acceptable for the POC.
- **`fallbackUsd` is currently always 0** — the route doesn't actually
  invoke the fallback model end-to-end yet (the call path exists but
  isn't threaded). Plumbing is stable, so the day fallback ships, no
  schema migration is needed.

#### Deferred to later slices

- Batch storage (`db.batch`) — schema scaffolded, slice 0007 fills it.
- Exports (`/export` PDF/CSV/JSON, batch ZIP) — slice 0008.
- A11y polish (keyboard navigation through history filters, focus
  management on reopen) — slice 0009.
- "Reset filters" button on history page — slice 0009 nice-to-have.
- LLM-judge call wiring (still pending from slice 0003).

### References

- `PRESEARCH.md` §8 — IndexedDB schema + server endpoint matrix
- `ALIGNMENT.md` — Marcus IT note, no-server-data constraint
- `issues/0005-override-and-history.md` — slice spec
- `memory-bank/plans/slice-5-detail.md` — execution plan
- `lib/storage/db.ts`, `types.ts`, `review-repo.ts`, `quota.ts`,
  `compose-review.ts`
- `components/HumanOverridePanel.tsx`, `FinalDecisionPanel.tsx`
- `app/history/page.tsx`, `app/review/page.tsx`
- `test/e2e/override-and-history.spec.ts` — chromium indexeddb roundtrip

---

## 0004: Camera capture + permissions state machine

**Date:** 2026-04-30
**Status:** Superseded by ADR 0008 (2026-05-02)
**Slice:** 0006 (camera capture milestone)

> **Superseded.** Camera capture was removed in the queue redesign.
> `PROJECT_BRIEF.md` does not mention live photo capture — Jenny Park's
> image-quality discussion describes brewery-submitted artwork the
> agent reads, not the agent taking new photos themselves. The queue
> model assumes agents review submitted artifacts. Marcus Williams's
> "our network blocks outbound traffic to a lot of domains" further
> argues against features that depend on browser-device APIs in the
> deployed posture. See ADR 0008 for the full rationale.

### Context

Mobile reviewers in the field need to capture a label image directly
without a separate phone-to-desktop transfer step. Browser
`getUserMedia` is the only portable path; the friction sits in the
permissions surface and the state-machine that drives the user
through "request permission → live preview → capture → review →
submit" without dead-ends.

Slice 0006 ships that camera path end-to-end on `/review?source=camera`
and reuses the existing extract-label flow once a frame has been
captured.

### Decision

#### State machine

```
                  click "Camera"
                        │
                        ▼
       ┌─────────────────────────────────┐
       │ permission-prompt               │
       │  - "Allow camera"               │
       │  - "Cancel"                     │
       └────────┬────────────────────────┘
                │  navigator.mediaDevices.getUserMedia({ video })
                ▼
       ┌─────────────────────────────────┐
       │ live-preview                    │
       │  <video autoplay playsInline />│
       │  - Capture button               │
       │  - Cancel                       │
       └────────┬────────────────────────┘
                │  canvas.getContext('2d').drawImage(video,...)
                ▼
       ┌─────────────────────────────────┐
       │ captured-pending-review         │
       │  <img src="blob:..." />        │
       │  - Submit                       │
       │  - Retake                       │
       └────────┬────────────────────────┘
                │  onCapture({ blob, width, height })
                ▼
       (camera shell closes; the captured image becomes the
        active label image for the standard review flow)
```

Closed-loop transitions:

- Permission denied → re-show prompt with the documented retry hint
  (link to site permission settings).
- Stream errors mid-preview → fall back to permission-prompt with a
  toast.
- "Retake" wipes the captured Blob URL and returns to `live-preview`
  without re-prompting.

#### Permissions surface

`<CameraPermissionsPrompt>` is a small component that:

- Renders inside `<CameraCapture>` while
  `state.kind === "permission-prompt"`.
- Exposes a single primary action ("Allow camera") that calls
  `navigator.mediaDevices.getUserMedia`.
- Surfaces the documented retry path on denial (copy + a deep link
  to `chrome://settings/content/camera` is intentionally omitted —
  Chrome blocks programmatic navigation there; we describe the path
  in plain English instead).

#### Capture pipeline

- A hidden `<canvas>` element matched to the live video's
  `videoWidth × videoHeight` does the actual frame grab.
- `canvas.toBlob('image/jpeg', 0.92)` produces the Blob.
- We pass `width` and `height` up via `onCapture` so the parent can
  size the resulting File correctly.

#### MediaStream lifecycle

- `getUserMedia` is invoked exactly once per "Allow camera" click,
  not on mount, so an unused camera shell never trips the OS
  permission popup.
- The MediaStream is stopped (`tracks.forEach((t) => t.stop())`)
  when the component unmounts or the user clicks "Close camera".
- All `URL.createObjectURL` calls have matching revoke calls in the
  effect cleanup.

#### E2E coverage

Playwright runs camera tests in a dedicated project with
`--use-fake-ui-for-media-stream` and
`--use-fake-device-for-media-stream` flags scoped to the project so
they don't auto-grant getUserMedia for any other spec. The fake
device pipes a synthetic colored frame as the video source.

The test exercises:
- click "Camera" → permission prompt
- "Allow camera" → live preview
- wait for `videoWidth > 0` (capture path throws otherwise)
- "Capture" → captured-pending-review with the captured-frame `<img>`
- "Submit" → camera shell closes; the captured image flows into the
  standard review flow.

### Consequences

#### Positive

- Mobile reviewers can use the same `/review` UI from a field
  device without a phone-to-desktop transfer step.
- The state machine is exhaustive: every kind has a documented
  transition, no `as any` or `null` shortcuts.
- Permission denial is recoverable — we don't strand the user in a
  permanent error state.
- E2E coverage uses the documented Playwright/Chromium flags, so
  the test exercises the same `getUserMedia` API path as production.

#### Negative

- Camera capture quality varies wildly across devices. Image-quality
  heuristics catch most field-shot defects, but a dim ambient lit
  bottle is still hard to extract from.
- iOS Safari `getUserMedia` requires the page to remain in the
  foreground — backgrounding the tab kills the preview without
  warning. We ship the docs note, not a UI signal.

#### Deferred to later slices

- Live device picker (front vs. rear camera) — useful for tablets,
  not in scope for the slice.
- Auto-capture on detected motion-stop — out of scope; reviewers
  push the shutter manually.

### References

- `issues/0006-camera-capture.md` — slice spec
- `memory-bank/plans/slice-6-detail.md` — execution plan
- `components/CameraCapture.tsx` — state machine + capture pipeline
- `components/CameraPermissionsPrompt.tsx` — permissions surface
- `lib/camera/get-user-media.ts` — `getUserMedia` wrapper
- `test/e2e/camera-capture.spec.ts` — E2E coverage
- `playwright.config.ts` — dedicated camera project with the fake
  media flags

---

## 0005: Batch flow + main-thread extraction pool

**Date:** 2026-04-30
**Status:** accepted
**Slice:** 0007 (batch milestone)

### Context

`/batch` needs to process up to **250 labels in one run** with live
per-row status, retry-on-failure, filter / sort, and a single
atomic save once the whole batch finishes. The hard constraints:

- Single browser tab — no service worker, no SharedArrayBuffer.
- OpenRouter API rate-limit (~100 req/min by default).
- The reviewer must see live progress, not a spinner that locks for
  three minutes.
- Per Marcus IT note: nothing persists server-side; the queue lives
  in the tab's memory until the batch completes.

The implementation choice was between **Web Workers + a
SharedArrayBuffer queue**, **a service worker queue**, or **a
plain-JS main-thread bottleneck pool**. Slice 0007 ships the
main-thread pool.

### Decision

#### Pool design

`lib/workers/extraction-pool.ts` exposes a small, generic pool:

```ts
interface ExtractionJob<P> { id: string; payload: P; }
interface PoolEvent { kind: "start" | "complete" | "error";
  id: string; result?: unknown; error?: string; durationMs: number; }

createExtractionPool({
  concurrency: number,      // 10 by default
  minIntervalMs: number,    // 600 ms — under the 100/min OpenRouter ceiling
  runner: (job, signal) => Promise<unknown>,
})
  .runAll(jobs: ExtractionJob[])
  .subscribe(handler: (evt: PoolEvent) => void)
```

- Concurrency: 10 — empirical sweet spot in slice 0007 micro-bench;
  higher saturates the rate-limit faster than additional jobs
  absorb the headroom.
- Rate-limit pacing: a `Bottleneck` instance configured with a
  600 ms `minTime` so we never burst past ~100 req/min even when
  jobs complete fast.
- `runner(job, signal)` receives an `AbortSignal` so the page can
  cancel mid-flight (planned future improvement; today the
  AbortSignal is wired but not surfaced in the UI).

#### Why main-thread (not Web Workers)

- The bottleneck is the OpenRouter network round-trip, not local
  CPU. Workers would add postMessage overhead without throughput
  gains.
- Web Workers can't share `fetch`'s connection pool or the browser's
  HTTP/2 multiplexing — each worker gets its own. The main-thread
  pool reuses one connection pool.
- IndexedDB writes (the saved Review) work fine on the main thread
  inside a single transaction at batch-completion. Workers would
  need `postMessage` round-trips for the same writes.
- Memory pressure is bounded by the in-memory `items[]` array; we
  don't hold the original Files in memory longer than each job
  needs.

#### Pairing CSV/JSON expected data

`lib/batch/csv.ts` and `lib/batch/json.ts` parse user-supplied
expected-data tables; `lib/batch/pair.ts` matches by
`filename` (case-insensitive, extension-agnostic) so a reviewer can
drop `bourbon-1.jpg` + `bourbon-1.json` and they pair automatically.

Unpaired labels surface as a "needs expected data" warning;
unmatched expected rows surface as a paired-row drop warning. Both
states are non-blocking so reviewers can proceed with the matched
subset.

#### Hard cap and soft confirmation

- **Soft modal at 50 files** with cost+ETA estimate sourced from the
  per-row pricing computed by the cost helper.
- **Hard cap at 250 files**; over-cap drops show a "Trim to 250"
  modal that picks the first 250 in the dropped list.

#### Atomic save at batch-completion

- `saveBatchWithReviews(batch, reviews)` opens a single IDB
  transaction across `db.review` and `db.batch` and writes every
  record in one shot. If the transaction aborts, no review lands —
  history doesn't get a half-batch ghost.

#### Mid-batch exports (slice 0009)

Summary CSV / Per-field CSV are buildable off the in-memory `items[]`
without waiting for save (slice 0009 fix). PDF / JSON ZIPs still
require save-first because they read the persisted thumbnail Blob.

### Consequences

#### Positive

- Reviewers see per-row status update live; the progress feels
  responsive even on slow networks.
- The batch saves atomically; partial-failed runs are explicit
  (`status: "partial-failed"`) rather than ghost records in
  `db.review` without a parent batch.
- The pool design is generic; if we later wanted to use the same
  pacing helper for PDF render fan-out, we can.
- Bottleneck provides retry semantics for free, but we surface them
  through the per-row error state instead of silently retrying so
  reviewers see the failure.

#### Negative

- **Tab close mid-batch loses unsaved rows.** Documented as a known
  limitation. A service worker queue would survive, at the cost of
  a much larger surface (worker scripts, message protocol,
  permission semantics, browser-by-browser quirks).
- Pool concurrency tuning lives in code (`POOL_CONCURRENCY = 10`).
  Runtime adjustment via env or settings is a future improvement.
- `Bottleneck` ships ~5 KB of vendor code we could replace with a
  hand-rolled limiter, but the dependency is well-tested and the
  size is acceptable.

#### Deferred to later slices

- AbortSignal-driven cancellation surfaced in the UI (slice 0009 —
  not yet shipped).
- Per-batch cost-tracking history (slice 0009 nice-to-have).
- Cross-tab batch resume — out of scope under the IT note.

### References

- `issues/0007-batch.md` — slice spec
- `memory-bank/plans/slice-7-detail.md` — execution plan
- `lib/workers/extraction-pool.ts` — generic pool
- `lib/workers/extract-worker.ts` — per-job runner (calls
  `/api/extract-label`)
- `lib/batch/{csv,json,pair}.ts` — pairing helpers
- `lib/batch/state.ts` — `composeBatchTitle`, `buildBatchSummary`,
  `POOL_CONCURRENCY`
- `lib/storage/batch-repo.ts` — atomic save
- `app/batch/page.tsx` — page component
- `test/e2e/batch.spec.ts` — E2E coverage

---

## 0006: Export pipeline + browser-side PKZIP writer

**Date:** 2026-04-30
**Status:** accepted
**Slice:** 0008 (exports milestone)

### Context

Reviewers need an audit-of-record they can attach to a compliance
ticket. The PRD requires four exports:

1. **Per-review PDF** — the human-readable audit copy.
2. **Per-review JSON** — machine-readable + complete + replay-able.
3. **Batch Summary CSV** — one row per review (top-level fields).
4. **Batch Per-field CSV** — one row per (review × field), including
   override audit columns.

Plus the bundled artifacts:
5. **All PDFs (zip)** — every review in one archive.
6. **All JSON (zip)** — every review JSON + a `batch.json` envelope.

The implementation choices: PDF rendering server-side (`@react-pdf/
renderer` in a Node route) vs. client-side (`react-pdf` browser
build); JSZip vs. a hand-rolled stored ZIP writer; CSV via PapaParse
vs. hand-rolled escaping.

### Decision

#### PDF — server-side `@react-pdf/renderer`

`POST /api/render-pdf` receives a `Review` JSON envelope (with
thumbnail base64) and renders the PDF in the route handler:

- `@react-pdf/renderer` runs Node-only; the browser build is
  heavy (~700 KB) and the route already runs on `iad1` close to
  the user.
- Built-in fonts (Helvetica / Times-Roman / Courier) avoid Vercel
  cold-start failures from custom font registration; we accept the
  styling tradeoff.
- The thumbnail comes in as base64 — keeps the React component
  pure and synchronous (no `fetch` inside `<Image>`).

#### CSV — PapaParse

`papaparse.unparse` handles RFC-4180 quoting + newlines + commas
embedded in field values without us hand-rolling escaping. Title
Case headers (slice 0009 fix-up) for spreadsheet ergonomics.

#### JSON — deterministic envelope

Single-review and batch JSON envelopes use `serializeReviewJsonAsync`
and `serializeBatchJsonAsync`. Thumbnails inline as base64 (so the
JSON is fully self-contained — not "go fetch this Blob URL"). Field
order is locked so two exports of the same Review produce
byte-identical JSON.

#### ZIP — hand-rolled stored (level-0) writer

`lib/export/zip/browser.ts` implements a minimal PKZIP writer in
~150 LOC. Reasons:

- **JSZip is ~120 KB minified.** The hand-rolled writer is ~5 KB.
- **We only need stored compression.** PDFs and JPEGs are already
  compressed; deflating them is a CPU sink with no payoff. CSV
  and JSON archives are small enough that level-0 storage is
  acceptable.
- **Byte-stable output.** The writer takes an explicit `mtime`
  parameter so two exports of the same batch produce byte-
  identical archives — auditors checksum these.

The writer emits Local File Headers + Central Directory Records +
the End-of-Central-Directory record per the PKZIP appnote (4.4.5
"compression method = 0"). CRC-32s are computed inline (no `zlib`
dep).

#### Export menu UX

`<ExportMenu>` wraps `@base-ui/react/menu` for keyboard nav + a11y.
Single-row PDFs/JSONs and batch CSV/PDF/JSON ZIPs each show a row
with a hint sub-line and a per-row spinner so reviewers know which
action is in flight. Toasts on success and failure.

Slice 0009 fix-up: when the batch isn't yet saved, mid-batch CSV
exports work via `disablePdfExport` — the in-memory `items[]` are
synthesized into a Batch + Review[] for the CSV path; PDF / ZIP
rows render disabled with a "Save the batch first" hint.

#### Filenames

Branded slugs + 8-char id stub:

- `prooflens-review-{brand-slug}-{id-stub}.pdf`
- `prooflens-review-{brand-slug}-{id-stub}.json`
- `prooflens-batch-{date}-{batch-id-stub}-summary.csv`
- `prooflens-batch-{date}-{batch-id-stub}-per-field.csv`
- `prooflens-batch-{date}-{batch-id-stub}-pdfs.zip`
- `prooflens-batch-{date}-{batch-id-stub}-json.zip`

### Consequences

#### Positive

- Bundle size stays tight: no JSZip, no client-side react-pdf, no
  custom fonts.
- Exports are byte-stable; auditors can checksum.
- Toasts + per-row spinners give reviewers honest feedback during
  long-running PDF batch renders.
- The hand-rolled ZIP writer is deliberately simple — one file,
  no dependencies, easy to vet.

#### Negative

- The hand-rolled ZIP writer doesn't compress. For some users with
  tens of thousands of CSV rows that might matter eventually; the
  current target (250 reviews max) is well within "just store it"
  range.
- The PDF route is a synchronous render. For a 250-PDF batch it
  takes a while; we render sequentially in the client glue to
  avoid memory spikes. Future improvement: chunked parallel
  renders with backpressure.
- `@react-pdf/renderer` doesn't support shadcn / Tailwind classes
  — the styling is StyleSheet objects in the component file. We
  accept the slight visual drift between the in-app review detail
  and the PDF artifact.

#### Deferred to later slices

- Compression for the JSON archive (DEFLATE) — slice 0009 NICE.
- Progress toast for ZIP renders > 10 PDFs — slice 0009 NICE.
- Per-export digital signature / watermark — out of scope for the
  POC.

### References

- `issues/0008-exports.md` — slice spec
- `memory-bank/plans/slice-8-detail.md` — execution plan
- `lib/export/pdf/template.tsx` — PDF component
- `lib/export/pdf/wire.ts` — Review → PDF buffer wrapper
- `app/api/render-pdf/route.ts` — server-side PDF endpoint
- `lib/export/csv/{summary,per-field}.ts` — Title Case CSV exports
- `lib/export/json/{single,batch}.ts` — JSON envelopes
- `lib/export/zip/browser.ts` — minimal PKZIP writer
- `lib/export/client.ts` — browser glue + download helper
- `components/ExportMenu.tsx` — `<ExportMenu>` UI
- `test/e2e/export.spec.ts` — E2E coverage

---

## ADR 0007 — OCR strategy: Tesseract local-only, LLM-fallback on Vercel

**Date:** 2026-05-01
**Status:** Accepted
**Phase:** 9 (Deploy + Production Smoke)

### Context

PRESEARCH §5.1 and §5.5 lock a hybrid extraction pipeline:

- Vision LLM (Claude Haiku 4.5 via OpenRouter) extracts structured fields.
- Tesseract.js runs in parallel and supplies `rawText` + word-level
  bboxes.
- The strict gov-warning matcher reads `rawText` (Tesseract output, not
  LLM output) so the **100 %-recall guarantee** is defended by a
  non-LLM source. This is the most important architectural property of
  the system — it's the regulatory hard requirement.

Phase-9 deploy smoke against `prooflens-ai.vercel.app` hit 504s on every
`/api/extract-label` POST after the page loaded successfully. The
Vercel function logs revealed the root cause:

```
Cannot find module '..'
Require stack:
  - /var/task/node_modules/.pnpm/tesseract.js@5.1.1/.../worker-script/node/index.js:13
    at Object.<anonymous> (...worker-script/node/index.js:13:16)
    at /opt/rust/bytecode.js:2:1110
```

`worker-script/node/index.js` does `require('..')` — a CJS shorthand
for the parent directory's `index.js`, which Node resolves correctly.
Vercel's experimental Rust-based bytecode runtime (`/opt/rust/bytecode.js`)
does **not** honor that shorthand; the `require()` fails with
`MODULE_NOT_FOUND` even though the parent file is present in
`/var/task`. The function then hangs until Vercel's `maxDuration`
reaper kills it.

We attempted nine successive fixes:

1. `maxDuration` 60s → 120s (`vercel.json`).
2. Bundle `eng.traineddata` into `public/tessdata/`.
3. Self-host `langPath` via `${VERCEL_URL}/tessdata`.
4. Trace `tesseract.js-core` WASM into the serverless bundle via
   `outputFileTracingIncludes`.
5. Broader pnpm-store trace globs (`./node_modules/.pnpm/tesseract.js*/**`).
6. `/api/diagnose` endpoint with file-presence audit.
7. `pnpm patch` registering `patches/tesseract.js@5.1.1.patch` via
   `patchedDependencies` in `pnpm-workspace.yaml`.
8. Pin `pnpm@10.32.1` via `packageManager` so Vercel honored the
   patch syntax.
9. `prebuild` script (`scripts/patch-tesseract.mjs`) doing an idempotent
   string replace on `node_modules/.../worker-script/node/index.js`.

Every one of those nine deploys produced the **byte-identical** error
stack — `/var/task/node_modules/.pnpm/tesseract.js@5.1.1/...` (no
`_patch_ha_` suffix), same `require('..')` failure, same hang. Vercel's
runtime is rewriting the file before invoking it; nothing we ship in
the deployment can change that path.

### Decision

**Tesseract is local-development-only.** On Vercel the route
(`app/api/extract-label/route.ts`) detects `process.env.VERCEL` and:

- Skips the `tesseractExtract(buffer)` call entirely.
- Uses the LLM's verbatim `governmentWarningText.value` as the `rawText`
  source for the strict matcher.
- Returns `{ words: [], confidence: 0 }` — bbox highlighting becomes a
  no-op on production; the UI gracefully omits the yellow rectangle.
- Adds `ocrSource: "tesseract" | "llm-fallback"` to the response so the
  UI / persisted `Review` records can surface which path was taken.

Local dev (`pnpm dev`) and the test suite still run Tesseract in
parallel — no changes to that path.

### Consequences

#### Wins

- The deployed app actually works. `/api/extract-label` returns 200
  inside the latency budget on Vercel.
- Layer 2 against the deployed instance maintained **11/11 gov-warning
  recall** on this code path before the patch experiments started — the
  LLM-as-rawText fallback is empirically validated.
- Schema-coercion fix from Phase 8 is unaffected — the LLM extraction
  path still benefits from the bare-scalar coercer.

#### Losses

- **Defense-in-depth weakened.** The 100 %-recall guarantee was
  originally backed by Tesseract (a non-LLM source) so a hypothetical
  future LLM regression couldn't silently pass a mutated gov-warning.
  On production we now trust the LLM to copy the warning text
  verbatim. The system prompt explicitly instructs verbatim
  preservation, and Layer 2 confirms it works in practice. CI mutation
  fuzz still defends the **matcher logic**; only the ground-truth
  source is different.
- **Bbox highlighting unavailable on production.** Click-to-highlight
  draws nothing on the image overlay because there are no Tesseract
  word bboxes to anchor to. The component renders the field row click
  state correctly; only the rectangle is missing.
- **Hallucination cross-check weakened.** The original design demoted
  any LLM `evidenceQuote` not present in Tesseract's `rawText` to
  manual review. On production that cross-check is short-circuited
  (rawText IS the LLM output, so every quote trivially "appears"). The
  nuanced ladder + confidence gate still catches gross hallucination.

#### Out-of-scope alternatives considered

- **Move OCR client-side.** Browser tesseract.js works without the
  Vercel bytecode bug. Would restore full feature parity but adds a
  5–8 s wait on the user's first label upload (worker init + WASM
  download), changes the client/server contract, and breaks the batch
  Web Worker pool's current shape. Worth doing if the project
  graduates from a polished POC to a production product.
- **Replace Tesseract with AWS Textract or Google Document AI.** Adds
  external infrastructure + cost; defeats the "OpenRouter only"
  preference locked in PRESEARCH §5.6.

### Implementation

- `app/api/extract-label/route.ts` — `skipTesseract` branch + `ocrSource`
  field.
- `app/api/extract-label/route.test.ts` — regression test asserting
  Tesseract is NOT called when `VERCEL=1` is set, and the response
  carries `ocrSource: "llm-fallback"`.
- `lib/ocr/tesseract.ts` — reverted to the simple default-CDN
  `createWorker` form. The self-host `langPath` indirection is gone.
- `next.config.ts` — `outputFileTracingIncludes` removed.
- `vercel.json` — `maxDuration: 120` retained as headroom for cold-
  start LLM calls.
- Removed: `app/api/diagnose/route.ts`, `scripts/patch-tesseract.mjs`,
  `patches/tesseract.js@5.1.1.patch`, `public/tessdata/`,
  `patchedDependencies` entry in `pnpm-workspace.yaml`.

`packageManager: pnpm@10.32.1` is retained — version pinning is good
practice independent of this decision.

---

## 0008: Queue page + design language adoption

**Date:** 2026-05-02
**Status:** Accepted
**Phase:** Post-Phase-9 polish

### Inputs

- **`PROJECT_BRIEF.md`** — verbatim take-home brief, including the four
  stakeholder interviews (Sarah Chen, Marcus Williams, Dave Morrison,
  Jenny Park). Source of truth for every UX rationale below.
- **`design/active-review-prototype.html`** — design reference for the
  Active Review screen. Visual language (calm white surface, dark
  header bar, pill statuses, two-column artwork + table layout) and
  CSS color tokens we adopt across the app.
- **`public/demo-labels/real/manifest.json`** — real-bottle-photo
  inventory paired with the application data each photo simulates.
  Multiple photos of the same product (front / angled / glare) become
  separate queue rows so the demo exercises image-quality detection on
  realistic signal.

### Context

`PROJECT_BRIEF.md` records the agent workflow Sarah Chen described:

> "An agent pulls up an application, looks at the label artwork, and
> checks that what's on the label matches what's in the application.
> Brand name matches? Check. ABV is correct? Check."

Through Phase 9, `/review` made the agent **type** application data by
hand, or click "Load demo scenario" to fill it. Neither flow reflects
the workflow above — in real life the application data is already on
file in COLA when the agent starts the review.

The brief also implies a queue concept. Sarah:

> "agents drowning in routine stuff"

Janet (relayed by Sarah):

> "during peak season, we get these big importers who dump 200, 300
> label applications on us at once."

Both presume work arrives in a list the agent works through, not as
ad-hoc one-offs.

Two further constraints from the brief shape the design:

- **Marcus Williams (IT):** "we're not looking to integrate with COLA
  directly — that's a whole different beast with its own authorization
  requirements." → the queue is mock; APP-IDs are synthetic.
- **Marcus again:** "don't do anything crazy. We're not storing
  anything sensitive for this exercise." → reviewer progress lives in
  IndexedDB; no server-side persistence; no auth.

### Decision

1. **`/queue` becomes the home (`/` redirects there).** Lists mock
   pending applications mapped 1:1 from the in-repo `DEMO_SCENARIOS`
   plus the manifest-driven `REAL_SCENARIOS`. Each row shows a
   deterministic APP-ID, brand, beverage type, source pill (Synthetic
   vs Real photo), description, and Reviewed-status pill.
2. **`/review` accepts `?scenario=<id>`.** When present, the page
   pre-loads BOTH the image and the application form from that
   scenario. The agent lands on a fully-populated Active Review —
   matching the brief's "data was already on file in COLA" workflow.
3. **Breadcrumb `Application Queue > APP-2026-XXXX`** appears on
   `/review` when the scenario param is set. Direct entry to `/review`
   (manual upload + manual entry) remains supported and shows no
   breadcrumb. This honors Dave Morrison's "if something can help me
   get through my queue faster, great. Just don't make my life harder
   in the process" — the manual path stays available.
4. **Site nav: Queue · Batch · History · Settings.** Active Review is
   contextual and reached via the queue; it does not get its own nav
   entry. `/batch` stays for Janet's "200, 300 at once" use case.
5. **Status-pill vocabulary aligns with the brief's reviewer
   language.** Field-level "Match / Flagged / Missing / Manual Review"
   instead of the engineering "Pass / Warning / Fail" — Sarah's "my
   mother could figure out" benchmark explicitly calls for clean,
   obvious labels. Overall pill keeps "Pass / Pass with Warnings /
   Needs Manual Review / Fail / Request Better Image" per PRD R-008.
6. **Camera capture removed.** `PROJECT_BRIEF.md` does not mention
   live photo capture — Jenny Park's image-quality discussion
   describes brewery-submitted artwork the agent reads, not the agent
   taking new photos themselves:

   > "I've seen labels that are photographed at weird angles, or the
   > lighting is bad, or there's glare on the bottle."

   Camera was an internal Phase-0 addition that predates
   `PROJECT_BRIEF.md` becoming the source of truth. Marcus's "our
   network blocks outbound traffic to a lot of domains" further
   argues against features that depend on browser device APIs in the
   deployed posture. ADR 0004 is marked superseded by this ADR; the
   `CameraCapture` component, `lib/camera/` module, dedicated
   Playwright project, and `?source=camera` URL param are all removed.
7. **Visual language adopted from `design/active-review-prototype.html`.**
   Solid pastel pills, dark CTA, calm white surface, breadcrumb +
   header structure, table-row hover tint. We adopt the *language*
   without porting the literal HTML — our existing `FieldRow`
   component renders the field + explanation + evidence vertically
   (richer than the prototype's single table row) and stays.
8. **`scenarioId` added to the `Review` IndexedDB schema as an optional
   string.** Lets the queue's "Reviewed" status pill be exact instead
   of brand-fuzzy. Additive change; existing records stay valid; no
   `CURRENT_RULES_VERSION` bump.
9. **Real-photo scenarios live alongside synthetic ones.** Multiple
   photos of the same product (front / angled / glare / low light)
   show up as separate queue rows so the reviewer sees how proofLens
   handles each condition. This directly addresses Jenny's wish that
   "AI could handle some of that" image-quality variation.

### APP-ID format

- Synthetic scenarios: `APP-2026-NNNN` (zero-padded sequential).
- Real-photo scenarios: `APP-2026-RNNN` (zero-padded sequential, R prefix).

The `R` prefix telegraphs "real photo" at a glance and keeps the two
sets in clearly disjoint id spaces. The 2026 year segment matches
`CURRENT_RULES_VERSION = "ttb-2026-04-30"`.

### Consequences

#### Wins

- The reviewer lands directly in their work — no friction figuring out
  where to start. Sarah's "my mother could figure out" benchmark.
- The Active Review is pre-loaded, mirroring how the actual TTB
  workflow operates (data already in COLA).
- Status vocabulary maps to the agent's mental model from the brief's
  interviews.
- Real bottle photos stress the image-quality heuristics with realistic
  signal — glare and angles flag as `imageQualityFlags` and demote
  affected fields to `manual-review`. Demonstrates the pipeline on the
  exact failure mode Jenny called out.
- Removing camera capture simplifies the queue model (agents review
  submitted artifacts, they don't snap photos) and drops a feature
  Marcus's restricted-network environment would block anyway.

#### Trade-offs

- Mock APP-IDs (`APP-2026-NNNN` / `APP-2026-RNNN`) are not real COLA
  references. The brief explicitly scopes COLA integration out
  (Marcus interview).
- The queue is a static view of `DEMO_SCENARIOS` + `REAL_SCENARIOS`.
  To add a "real" pending application a developer edits the array or
  drops a photo into the manifest; there is no upload UI on the Queue
  page itself. Bulk uploads still live at `/batch`.
- The "Reviewed" status pill is exact (matched by `scenarioId` on the
  saved Review record). Reviews saved without a `scenarioId` —
  defensive fallback only; none exist today — count as Pending for
  the queue.
- Direct `/review` entry remains supported, so we keep both manual
  uploader and queue-driven entry alive. That's two code paths through
  one page; the page handles both with a `fromQueue` boolean derived
  from the URL.

### Implementation

- `app/queue/page.tsx` — new route. Reads `listApplications()` for
  rows; reads IndexedDB via `listReviews()` to mark Reviewed/Pending.
- `lib/queue/applications.ts` — pure mapper from `DemoScenario` and
  `RealScenario` to `QueuedApplication` (deterministic APP-IDs).
- `lib/demo/real-scenarios.ts` — Zod-validated manifest loader for
  real bottle photos.
- `lib/storage/types.ts` — `Review` adds optional `scenarioId?: string`.
- `lib/storage/compose-review.ts` — `composeReview()` accepts and
  persists `scenarioId` when supplied.
- `app/review/page.tsx` — reads `?scenario=<id>`, pre-loads image +
  form, renders breadcrumb, persists `scenarioId` on save.
- `components/site-nav.tsx` — new nav entries (Queue · Batch · History
  · Settings); wordmark links to `/queue`.
- `app/page.tsx` — `redirect('/queue')`.
- E2E: `test/e2e/queue.spec.ts` covers the queue → review handoff
  (synthetic and real-photo paths).

### Supersedes

- ADR 0004 (Camera capture + permissions state machine) — superseded
  by removal in this redesign.

---

## 0009: Grader audit — alignment, warnings, and deferrals

**Date:** 2026-05-03
**Status:** Accepted
**Phase:** Post-Phase-9 polish

### Context

Phase-9 user testing surfaced a real grading bug: the bottler-address
matcher returned **Fail** on `BARDSTOWN, KENTUCKY` for an application
filed at `123 Bourbon Lane, Bardstown, KY 40004`. That triggered a
full audit of every field grader against (a) `PROJECT_BRIEF.md`, (b)
the verbatim TTB regulations captured in
`research-findings/01-ttb-regulatory.md`, and (c) the actual demo
scenarios.

The audit found two correctness gaps and two regulatory checks the
grader silently passed even when the label was non-compliant. This
ADR records the four decisions, the framing as warnings (not fails)
for the regulatory adds, and the deferred items.

### Decisions

#### 1. Bottler-address grader: city + state only

**Change:** New `bottlerAddressMatch(...)` matcher used only on the
`bottlerAddress` field. Pre-normalisation: strip 5-digit ZIP codes
(and ZIP+4) as whole-word tokens; alias full state names ("Kentucky",
"New York", "Puerto Rico") to USPS two-letter abbreviations before
running the standard nuanced ladder.

**Why:**

> "Address = city + State (postal abbreviation OK). Must match the
> basic permit. **Street, county, ZIP, phone, website are *optional*.**"
> — 27 CFR § 5.66 (spirits), § 4.35 (wine), § 7.66 (malt)

The bottler `name` field continues to use the original `bottlerMatch`
because state aliasing and ZIP stripping aren't appropriate there.

**Stakeholder evidence:** Dave Morrison's "you need judgment" example
(STONE'S THROW vs Stone's Throw) is the same shape — the label says
less than the application but it's obviously the same place.

#### 2. Country-of-origin: auto-derive `isImported`

**Change:** In `lib/verify/pipeline.ts`, set
`ruleContext.isImported = !isUnitedStates(expected.countryOfOrigin)`,
where `isUnitedStates` is a small exported helper using the existing
US-aliases table from `countryMatch`. Also added the missing "optional
+ extraction null = not-required" branch to the country block,
mirroring the existing ABV pattern.

**Why:**

> "Country of origin for imports" — `PROJECT_BRIEF.md`

Maps cleanly to "if it isn't US, it's imported." Avoids a separate UI
checkbox the applicant has to remember to tick. CBP rules at 19 CFR
Part 134 (cross-referenced from § 5.67/5.68/4.35/7.68) require the
country marking only for imports.

#### 3. Net-contents standards-of-fill: warn (not fail)

**Change:** New pure helper `isAuthorizedFillSize(volumeMl, beverageType)`.
After the existing volume-match check passes, demote `pass → warning`
when the volume isn't on the TTB list. Volume-match semantics
unchanged; the warning is an overlay.

**Why warn, not fail:** The brief says check that "what's on the label
matches what's in the application." When label and application both
say `680 mL`, the **match** is correct — the regulatory issue is that
both are on a non-standard fill. That's reviewer-judgment territory:
the agent might know the applicant has a § 5.203 variance, or might
need to kick the application back. We surface; we don't pre-judge.

**Source:** `research-findings/01-ttb-regulatory.md` Q5 enumerates the
authorized lists per § 4.72 (wine) and § 5.203 (spirits, post-2025
TTB-200). Malt has no fixed list (§ 7.70 — US customary units).

#### 4. Bottler function-describing phrase: warn (not fail)

**Change:** New pure helper `findBottlerFunctionPhrase(rawText, evidence)`
that scans the raw OCR text — NOT the structured `bottlerName` field —
for any of the TTB-approved verbs (`Bottled by`, `Distilled by`,
`Brewed and bottled by`, `Vinted and bottled by`, etc.) within an
80-character window of the bottler-name evidence quote. After the
bottler-name value-match passes, demote `pass → warning` if no verb
is found.

Tolerance hierarchy:
1. **Strict proximity check first** — only count a verb that precedes
   the bottler name within the window. Rejects unrelated mentions of
   a verb that pertain to a different brand on the same label.
2. **If the evidence quote is null/empty (LLM didn't extract one)
   OR can't be located in the OCR** (fragmentation drift), fall back
   to scanning the entire OCR. Avoids false-warning purely because
   of an extraction artifact.

**Why warn, not fail; why scan the raw OCR not the structured field:**
The LLM extractor today returns a clean bottler name like
`Old Tom Distillery, LLC` even when the artwork prints
`BOTTLED BY OLD TOM DISTILLERY, LLC` — it strips the verb during
extraction. Checking the structured field would false-fail every
compliant label. Scanning the raw OCR (which we already have as
`rawText` from Tesseract) catches the verb regardless of how the
LLM parsed it.

The 80-char proximity window prevents matching unrelated mentions of
a verb elsewhere on the label (e.g., a fanciful tagline that happens
to include "made by hand").

**Source:** `research-findings/01-ttb-regulatory.md` Q6 enumerates the
approved verbs per § 5.66 / § 4.35 / § 7.66.

### Why warnings (not fails) for #3 and #4

Failing a label that the matcher confirmed matches the application
would contradict the brief's mental model. Sarah Chen's *"agent pulls
up an application, looks at the label artwork, and checks that what's
on the label matches what's in the application"* is a **match** check.
The TTB regulatory checks (#3, #4) are a different axis: even when
the match is correct, the label can be regulatorily imperfect.

Warnings let us:
- Preserve the brief's match semantics (Pass = label matches app).
- Surface the regulatory deviation for human judgment.
- Avoid hard-failing a label the applicant might have a variance for.
- Avoid false-failing extraction artifacts (the function-phrase case).

If we later want strict compliance failures, the warning → fail
upgrade is a one-line change in each block.

### Aligned (no change)

Per the audit in the plan §2, these graders match TTB + brief today:

- **Government warning text** (§ 16.21) — verbatim matcher with
  mutation-fuzz CI gate; case-folds the body so ALL-CAPS labels pass
  (regulation prescribes capitalisation only on the prefix).
- **ABV value** (§§ 5.65 / 4.36 / 7.65) — beverage-aware tolerances;
  taxable-grade boundary check for wine.
- **Brand name** — standard nuanced ladder.
- **Class/type designation** — standard nuanced ladder.

### Deferred

Real TTB gaps we explicitly chose NOT to cover this iteration:

1. **ABV format-compliance check** (§§ 5.65 / 4.36 / 7.65). The
   parser accepts many forms for extraction; format compliance —
   the regulation prescribes one of three specific patterns —
   is a separate axis. A label that says `Strength 40%` or `40% A/V`
   would pass our value-check but fail real TTB review. Future work.
2. **Class/type substantive compliance.** "Bourbon Whiskey" has a
   51%-corn-grain rule; "Cabernet Sauvignon" has a 75%-varietal
   rule. Verifying these would need formula data outside our system.
   Out of scope per Marcus Williams's *"we're not looking to integrate
   with COLA directly"*.
3. **§ 16.22 type-size / contrast / placement** for the gov warning.
   Real but uncoverable today: we lack DPI metadata for mm
   measurement, and contrast/bold detection is brittle on photos
   with glare/skew (the Ron Zacapa real-photo cases already trip our
   existing image-quality heuristics; layering more vision checks
   compounds the noise). A smaller LLM-based "is the warning
   visually prominent" rating could land here in a future pass
   without making false-promise claims about pixel-to-mm conversions;
   deferred until we decide whether to extend the extraction prompt.

### Implementation

- `lib/verify/nuanced/address.ts` — bottler-address matcher.
- `lib/verify/nuanced/bottler-function-phrase.ts` — function-phrase scanner.
- `lib/verify/strict/standards-of-fill.ts` — authorized-volumes lookup.
- `lib/verify/nuanced/matchers.ts` — exports `isUnitedStates`.
- `lib/verify/pipeline.ts` — wires all four behaviors.
- `lib/verify/types.ts` — adds `net_contents_non_standard_fill` and
  `bottler_function_phrase_missing` to `RuleOutcomeKindSchema`.
- `lib/verify/explain/templates.ts` — explanation strings for the new
  outcomes.

### Consequences

#### Wins

- Old Tom regression fixed; real-photo scenarios (Bacardi, Ron Zacapa,
  Jack Daniels) all pass on bottler-address with city+state alone.
- Imported products now correctly enforce the country-of-origin
  required rule.
- Two new regulatory dimensions surfaced as warnings — net-contents
  standards-of-fill and bottler function-describing phrase — without
  introducing false-fails on compliant labels.
- ADR makes the "warning vs fail" framing explicit for future agents.

#### Trade-offs

- Two new RuleOutcome kinds expand the explanation registry; the
  templates registry test required both to be covered (done).
- The function-phrase scanner runs on every nuanced bottler-name
  check, but it's a pure string scan over OCR text we already have —
  no extra latency.
- Standards-of-fill list is hardcoded; future TTB amendments require
  a code change. Acceptable: the list moves about once every five
  years (last amendment was T.D. TTB-200, 2025-01-10).

### Supersedes

None. Extends ADR 0002 (verification pipeline architecture).

---

## 0010: Production-or-cut rule — no half-features

**Date:** 2026-05-03
**Status:** Accepted
**Phase:** Post-Phase-9 finalize

### Context

Several Phase-9 follow-up changes shipped features that worked in
local dev but broke on Vercel. The root cause is consistent: ADR 0007
documents that Tesseract.js is disabled on Vercel (the experimental
Rust bytecode runtime can't resolve tesseract.js v5's CJS
worker_threads chain). The `rawText` and `words[]` outputs are
synthesized as a sparse fallback in production (see
`app/api/extract-label/route.ts:234`):

- `rawText` becomes the LLM's gov-warning capture only (≈ 320 chars).
- `words[]` is empty.

Code that consumes those values silently degrades on Vercel. Two
concrete cases:

1. **Bbox click-to-highlight** — depended on `words[]`. UI rendered
   the affordance ("Click a field on the right to highlight its
   source") but the click did nothing visually on production.
2. **Bottler function-phrase scanner** — depended on `rawText`. On
   Vercel the verb-bearing label text isn't in `rawText`, so the
   scanner false-warned on every label that contained the verb.

The user's explicit instruction (this session, paraphrased):

> "Any tools that don't work in production should not be in the app
> or a working alternative should be used."

This ADR codifies that rule.

### Decision

Going forward, when a feature depends on a local-only or
environment-specific signal:

1. **Default to cut.** Remove the affordance from the UI and the
   handler from the codebase. Don't ship a feature that's silently
   dead in production.

2. **Working alternative is the only valid alternative to cut.**
   "Build a fallback" is acceptable only when the fallback genuinely
   provides the feature in production. Half-features (works on
   local, dead on Vercel) are not allowed.

3. **Document the cut.** When a feature is removed under this rule,
   record the decision in this ADR (or extend it) so a future agent
   doesn't reintroduce the same broken pattern.

### What this ADR cuts (today)

- **Bbox click-to-highlight overlay** in the review page's left-
  column LabelImagePreview. The SVG overlay code in
  `components/LabelImagePreview.tsx` stays (still useful for tests
  and for any future Vercel-friendly bbox source), but the page no
  longer passes a non-null `bbox` prop. The "Click a field on the
  right..." help-text is removed. Field-row click still expands the
  HumanOverridePanel — that's a real action, not a dead promise.
- The page-level `activeField` / `activeBbox` state is removed; the
  controlled `selectedField` / `onSelectField` props on
  `VerificationDetail` are still accepted (back-compat) but no caller
  passes them — `VerificationDetail` falls back to its internal
  `activeField` state for the override-panel toggle.

### What this ADR keeps (with a working alternative)

- **Bottler function-phrase scanner** — fixed in the same change set.
  The scanner now merges `rawText` AND the LLM's
  `bottlerName.evidenceQuote` into a single haystack. On Vercel,
  rawText is sparse but the LLM's evidence quote typically contains
  the verb-bearing slice (e.g., "BREWED AND BOTTLED BY STONE'S THROW
  BREWING CO."). On local dev, both sources have the verb; merging
  is a no-op safety net. See `lib/verify/nuanced/bottler-function-
  phrase.ts`.

### Consequences

#### Wins

- No more "feature looks like it works locally but produces a dead
  click / false signal on Vercel". The deployed app's UX matches
  what the local app shows.
- Future agents have a clear rule to apply when adding features that
  touch `rawText` / `words[]` / any local-only signal.
- The audit plan at
  `memory-bank/plans/2026-05-03-full-review-and-finalize.md`
  references this ADR as the source of the production-or-cut rule.

#### Trade-offs

- **Lost functionality:** local-dev users who clicked a field row
  saw a bbox highlight on the label image. That's gone for everyone.
  Acceptable: the feature was inconsistent and any reviewer who only
  used production never had it.
- **Bbox in PDF exports:** the `FieldResult.bbox` field is still
  populated by the pipeline (when Tesseract runs locally) and still
  flows into PDF exports. The export of saved reviews uses whatever
  bbox was present at save time. This is an inconsistency — saved
  reviews from local dev have bboxes; saved reviews from Vercel
  don't. We accept this for now because the export consumer is the
  reviewer themselves (it's an audit document, not a regulator
  artifact).
- **The pipeline still computes bboxes when Tesseract is available.**
  We could remove that code too, but leaving it preserves the option
  to re-enable bbox UI if a Vercel-friendly source lands later
  (e.g., LLM-returned approximate bboxes in a future prompt
  iteration).

### Future work

If a Vercel-friendly bbox source lands (most likely path: extend
the LLM extraction prompt to include approximate bbox per field as
a four-int tuple), the click-to-highlight UI can be re-added. That
would be a feature ADR, not a reversal of this one — this ADR only
cuts the broken affordance, not the conceptual feature.

### Supersedes

None. Extends ADR 0007 (OCR prod-vs-local). Cited from
`memory-bank/plans/2026-05-03-full-review-and-finalize.md`.
