# 0003: IndexedDB persistence + override audit trail

**Date:** 2026-04-30
**Status:** accepted
**Slice:** 0005 (reviewable milestone)

## Context

Marcus's IT note (locked in `ALIGNMENT.md`): "not storing anything
sensitive for this exercise." This drove Phase 2's pivot from Better
Auth + Neon Postgres + Cloudflare R2 to **browser-local persistence
only**. Slice 0005 ships that persistence layer + the per-field
override + final-decision UI that turns proofLens into a usable
end-to-end review tool.

The core question this ADR records: how do we keep the audit trail
trustworthy when nothing is persisted server-side?

## Decision

### Storage: IndexedDB via `idb`

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

### Schema (matches `PRESEARCH.md` §8.1)

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

### Override audit trail

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

### Final decision

`HumanDecision` carries `decision`, `notes`, `reviewerName`,
`timestamp`. Save is gated on **both** reviewer name AND a chosen
decision being non-empty. Reviewer name is sticky across sessions in
the `settings` store.

### Composing reviews — pure helper for testability

`composeReview` in `lib/storage/compose-review.ts` takes the AI extraction
output, expected data, and the chosen decision; injects `id` and `now()`
as parameters; returns a fully-typed `Review`. The page-level call site
passes `crypto.randomUUID()` and `() => new Date()`. Pure inputs/outputs
make tests deterministic without mocking globals.

### Save flow

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

### History page

`/history` renders newest-first. Search by brand or reviewer name (UI
state debounced via `useDeferredValue`). Filter by overall status,
beverage type, has-overrides. Click a row → `/review?reviewId=<uuid>`.
Empty state distinguished from no-matches state.

The earlier `searchReviews` repo helper was deleted in the fix-up pass:
filtering happens in-memory in `ReviewHistoryList` over the loaded
review list. Two parallel filter implementations would drift; for POC
scale, in-memory is fine. If scale grows, slice 0009 can re-introduce
indexed lookups.

### Reopen flow

`/review?reviewId=<uuid>` reads from `db.review`, hydrates the page
state from the persisted Review (thumbnail → object URL via `useEffect`
with cleanup, expectedData → form, fieldResults → VerificationDetail,
overall → verdict pill). The reviewer can apply additional overrides
or change the final decision and save again.

`URL.createObjectURL` on the reopened thumbnail is revoked on unmount
or on review change to prevent blob-URL leaks. (Initial slice
implementation missed this; fix-up added it.)

### Server endpoints stay stateless

`/api/extract-label` and `/api/judge-field` persist nothing. Slice 0005
adds zero server-side persistence. The IT note is honored.

## Consequences

### Positive

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

### Negative

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

### Deferred to later slices

- Batch storage (`db.batch`) — schema scaffolded, slice 0007 fills it.
- Exports (`/export` PDF/CSV/JSON, batch ZIP) — slice 0008.
- A11y polish (keyboard navigation through history filters, focus
  management on reopen) — slice 0009.
- "Reset filters" button on history page — slice 0009 nice-to-have.
- LLM-judge call wiring (still pending from slice 0003).

## References

- `PRESEARCH.md` §8 — IndexedDB schema + server endpoint matrix
- `ALIGNMENT.md` — Marcus IT note, no-server-data constraint
- `issues/0005-override-and-history.md` — slice spec
- `memory-bank/plans/slice-5-detail.md` — execution plan
- `lib/storage/db.ts`, `types.ts`, `review-repo.ts`, `quota.ts`,
  `compose-review.ts`
- `components/HumanOverridePanel.tsx`, `FinalDecisionPanel.tsx`
- `app/history/page.tsx`, `app/review/page.tsx`
- `test/e2e/override-and-history.spec.ts` — chromium indexeddb roundtrip
