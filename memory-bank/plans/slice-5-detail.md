# Slice 0005 — Override + IndexedDB history — execution plan

## Source-of-truth spec

`issues/0005-override-and-history.md`. This slice ends the
"reviewable" milestone — when complete, the conductor pauses for user
review.

## Branch

`slice/0005-override-and-history` off main. Worktree:
`.worktrees/slice-0005-override-and-history/`.

## Context delta

After slice 0004: verification pipeline ships, quality flags + override
work, /review screen renders VerificationDetail with field rows + click-
to-highlight bbox. Reviewer has no way to override field statuses, mark
final decisions, or persist the review anywhere yet. Everything lives
in component state.

## What's in / what's out

**In scope (this slice):**
- Per-field override panel (status enum select + reason text + audit fields)
- Final decision panel (4 options + reviewer name + notes)
- IndexedDB schema via `idb` (review, batch, demoData, settings stores)
- History page at `/history` with search, filter, reopen, AI-vs-overridden indicator
- Quota check + 80%-full banner
- Reviewer name persistence in `settings` store (sticky pre-fill)
- Save flow with thumbnail (256px JPEG) generation client-side
- Reopen flow (`/review?reviewId=<uuid>`) hydrates state

**Out of scope:**
- Camera capture (slice 0006)
- Batch flow (slice 0007)
- Exports (slice 0008)
- Final demo polish + a11y final pass (slice 0009)

## Task graph

### Track 1 — IndexedDB schema (TDD)
1. **Failing tests first**: `lib/storage/db.test.ts` — open db, version 1, four object stores; transactions roundtrip.
2. `lib/storage/types.ts` — `Review`, `Batch`, `Setting`, `DemoData` interfaces. Match PRESEARCH §8.1 schema:
   - `Review`: id, createdAt, reviewerName, beverageType, rulesVersion, expectedData, extracted, fieldResults, overall, imageQualityFlags, thumbnail (Blob), bboxes, rawText, decision (HumanDecision | undefined), processingTimeMs, aiSpend
   - `Batch`: id, createdAt, reviewerName, reviewIds[], status, summary
3. `lib/storage/db.ts` — `idb` wrapper. Singleton `openDb()` returning typed DB.
4. `lib/storage/review-repo.test.ts` — CRUD: create, read, update with override, delete, list, search-by-brand, search-by-reviewer, filter-by-status, filter-by-beverage, filter-by-has-overrides.
5. `lib/storage/review-repo.ts` — typed CRUD over `db.review`.
6. `lib/storage/batch-repo.ts` — placeholder for slice 0007 (just type-safe stubs).
7. `lib/storage/quota.test.ts` — `getQuotaStatus()` returns `{ used, available, percentage }` from `navigator.storage.estimate()`.
8. `lib/storage/quota.ts` — implementation; mock `navigator.storage` in tests.

### Track 2 — Override + final-decision UI (TDD)
9. **Failing tests first**: `components/HumanOverridePanel.test.tsx` — RTL: opens collapsed by default; expand reveals new-status select + reason textarea + save button; save emits payload with new status, reason, timestamp, reviewerName.
10. `components/HumanOverridePanel.tsx` — per-field row override controls.
11. **Failing tests first**: `components/FinalDecisionPanel.test.tsx` — RTL: requires reviewer name; "Save review" disabled until name + decision set; save emits full decision payload (decision, notes, reviewerName, timestamp).
12. `components/FinalDecisionPanel.tsx` — final-decision UI with shadcn Select + Textarea.
13. Update `components/FieldRow.tsx` to embed `HumanOverridePanel` when expanded; show original AI status alongside override.
14. Update `lib/verify/types.ts` — add `humanOverride?: { originalAiStatus, humanStatus, reason, timestamp, reviewerName }` to `FieldResult`.
15. Update `components/VerificationDetail.tsx` — render `FinalDecisionPanel` below the field results; pass save callback up to `/review`.

### Track 3 — Save + history wiring
16. **Failing tests first**: `app/review/page.test.tsx` — saving a review writes to IndexedDB; thumbnail generated via Canvas; reviewer name persisted in settings store.
17. Update `app/review/page.tsx` — wire save flow:
    - Generate 256px JPEG thumbnail from the uploaded/captured image via `<canvas>` resize
    - Compose `Review` record with all the data we have
    - Write to IndexedDB
    - Update settings.reviewerName
    - Toast on success / failure
18. Quota gate — before save, check `getQuotaStatus()`; if percentage > 80, show banner "History is nearly full — export and clear before adding more" but allow save to proceed (don't block).

### Track 4 — History page (TDD)
19. **Failing tests first**: `app/history/page.test.tsx` — empty state when no reviews; renders rows when present; search filters by brand / reviewer; status filter works; click row navigates to `/review?reviewId=<uuid>`.
20. `app/history/page.tsx`:
    - Header + nav back to home
    - Search input (debounced 200ms)
    - Filter chips: status (all / pass / fail / manual-review / etc.), beverage, has-overrides
    - List of rows, newest-first
21. `components/ReviewHistoryRow.tsx` — thumbnail + brand + beverage + overall status badge + AI-vs-overridden indicator + reviewer name + relative date.
22. `components/ReviewHistoryList.tsx` — composes rows + filter + search.

### Track 5 — Reopen flow
23. Update `app/review/page.tsx` to support `?reviewId=<uuid>` search param:
    - On mount with reviewId, read from `db.review`, hydrate component state (image preview from stored thumbnail, expectedData, fieldResults, overall)
    - URL-trigger `useSearchParams()` from `next/navigation`
    - If reviewId not found, fall back to "create new review" flow with toast
24. Update e2e: load history → click reopen → verify state hydrated.

### Track 6 — Nav + cross-cutting
25. Update `components/site-nav.tsx`: now `/history` is a real route. Promote it from "Coming soon" to a real `<Link>`.
26. Update `app/page.tsx`: include "View history" CTA when reviews exist (read count from IndexedDB on mount).
27. Update STUDY_GUIDE.md: "Why we use IndexedDB instead of a server DB" + "How override audit fields work".

## Acceptance gate

Per `issues/0005-override-and-history.md`. All 9 acceptance criteria
checked off. Vitest grows from 280 to ~330-360. Playwright grows from
10 to ~13. All quality gates green. Mutation fuzz still 100/100.

## Estimated effort

5-6h. Track 1 (IndexedDB schema + tests) is the trickiest because
`fake-indexeddb` setup needs care.

## Reasonable deviations

- If `fake-indexeddb` integration in vitest is fragile, ship with a
  thin in-memory mock for unit tests and rely on the e2e for the real
  IndexedDB roundtrip. Document.
- Filter UI can be a single shadcn Select dropdown rather than chips
  if shadcn lacks chip components. Use whichever is cleanest.
- Thumbnail generation can use `OffscreenCanvas` if available, fall
  back to `<canvas>` synchronous resize.
