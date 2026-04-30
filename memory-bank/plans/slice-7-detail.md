# Slice 0007 — Batch flow + Web Worker pool — execution plan

## Source-of-truth spec

`issues/0007-batch-flow.md`.

## Branch

`slice/0007-batch-flow` off main. Worktree:
`.worktrees/slice-0007-batch-flow/`.

## Context delta

After slice 0006: full single-label review (upload + camera + override
+ history + reopen) ships. This slice adds batch processing: drop
many labels + paired CSV/JSON expected-data, queue with 10 concurrent,
filterable result table, retry failed, save batch + reviews to
IndexedDB.

## What's in / what's out

**In scope:**
- `/batch` page — two dropzones (labels + paired CSV/JSON), queue
  table, summary panel, batch ExportMenu (slice 0008 wires real
  exports — leave a stub here)
- `lib/batch/pair.ts` — case-insensitive + extension-agnostic filename
  pairing; collisions resolved with first-match warning
- `lib/batch/csv.ts` — `papaparse`-based CSV reader with line-numbered
  schema validation
- `lib/batch/json.ts` — JSON paired reader with field-path errors
- `lib/workers/extraction-pool.ts` — typed Web Worker pool wrapper of
  10 (configurable)
- `lib/workers/extract-worker.ts` — worker that fetches
  `/api/extract-label` per file
- `bottleneck` per-provider rate-limit on the main thread
- Soft-warn modal at 50 files (cost + ETA estimate); hard cap 250
- Per-file status: `Queued | Processing | Complete | Failed | Manual Review | Request Better Image`
- Filterable result table by status / beverage / has-failures /
  reviewer-overridden
- Retry single failed; "Retry all failed" bulk action
- Batch detail modal — opens single review inline (full
  `VerificationDetail` rendering)
- Save flow: `db.batch` + per-review `db.review` writes in a
  transaction; `Batch.reviewIds` relationship
- Batch summary panel (PRD §9.2): total / completed / passed /
  warnings / failed / manual-review / quality-issues / avg-time / total-time
- `/api/template/csv` route returns CSV template stream

**Out of scope:**
- Real exports (slice 0008 — stub the menu here)
- Final polish + a11y final pass + docs (slice 0009)

## Task graph

### Track 1 — Pairing logic + parsers (TDD)
1. **Failing tests first**: `lib/batch/pair.test.ts` — case-insensitive,
   extension-agnostic, unpaired flagged, collisions first-match-with-warning.
2. `lib/batch/pair.ts`.
3. **Failing tests first**: `lib/batch/csv.test.ts` — valid → typed,
   malformed row rejected with line number, missing column rejected.
4. `lib/batch/csv.ts` — `papaparse` + Zod-validated rows.
5. **Failing tests first**: `lib/batch/json.test.ts` — schema violations
   with field path.
6. `lib/batch/json.ts`.
7. `app/api/template/csv/route.ts` — returns CSV template stream
   (header row + one example row).

### Track 2 — Web Worker pool (TDD)
8. **Failing tests first**: `lib/workers/extraction-pool.test.ts` —
   pool of 10 processes 30 jobs respecting max concurrency; failed jobs
   surface; retry-failed re-queues; abort allows in-flight to complete.
9. `lib/workers/extraction-pool.ts`.
10. `lib/workers/extract-worker.ts` — receives `{ image, expected }`,
    posts to `/api/extract-label`, returns response.
11. `bottleneck` rate-limit on main thread (per-provider, default 100/min).

### Track 3 — Batch UI (TDD)
12. **Failing tests first**: `components/BatchDropzone.test.tsx` —
    drop > 250 trims; drop ≥ 50 confirms with cost+ETA; both dropzones expected.
13. `components/BatchDropzone.tsx`.
14. **Failing tests first**: `components/BatchQueue.test.tsx` —
    filter, retry single, retry all, click row → modal.
15. `components/BatchQueue.tsx`.
16. `components/BatchSummaryPanel.tsx`.
17. `components/BatchDetailModal.tsx` — embeds `VerificationDetail`.
18. `app/batch/page.tsx`.
19. Promote `/batch` in `site-nav.tsx`.
20. Add Batch CTA on `app/page.tsx`.

### Track 4 — Storage extension
21. Update `Batch` schema in `lib/storage/types.ts` per PRESEARCH §8.1.
22. Flesh out `lib/storage/batch-repo.ts` — transactional batch + reviews write.
23. Bump `lib/storage/db.ts` version if needed.

### Track 5 — E2E
24. **Failing test first**: `test/e2e/batch.spec.ts` — drop 5 demo
    labels + CSV → queue → completion → summary → retry-failed → detail
    → filter.

### Track 6 — Demo scenario 07 + STUDY_GUIDE.md
25. `public/demo-batch/manifest.json` — paired list referencing scenarios
    01-06 + variants.
26. "Load demo batch" button on `/batch`.
27. Register scenario 07 in `lib/demo/scenarios.ts`.
28. STUDY_GUIDE.md — add "How the Web Worker pool works" + "Why we cap
    at 250".

## Acceptance gate

Per `issues/0007-batch-flow.md`. All acceptance criteria checked.
Vitest grows from 386 to ~440-470. Playwright grows from 14 to ~17.
All quality gates green. Mutation fuzz still 100/100.

## Estimated effort

6-7h. Most complexity in the pool + batch state machine.

## Reasonable deviations

- If `bottleneck` doesn't play with Web Workers, ship a custom
  semaphore that limits in-flight jobs from the main thread.
- Cost+ETA estimates are rough (read `lib/ai/pricing.ts` + p50 ~5s/file).
- Tab-close mid-batch behavior: completed reviews persist; in-flight
  worker results lost. Document.
- ExportMenu can stub real exports; toast "Export coming in slice
  0008" — actual renderers land in slice 0008.
