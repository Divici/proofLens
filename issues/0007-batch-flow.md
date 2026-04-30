# 0007: Batch flow with Web Worker pool

**Blocked by:** 0005
**Blocks:** 0009
**Requirements addressed:** R-002, R-004 (CSV/JSON paired import), R-017 (per-label progress)
**Demoable:** Reviewer drops 30 label files + a paired CSV (filename matches), the queue pairs them, soft-warn fires at 50, processing kicks off with 10 concurrent extractions, per-file progress streams live into the result table, status filter works, retry-failed works, hard cap at 250 enforced.
**Estimated effort:** 6-7h

## Acceptance criteria
- [ ] R-002: `/batch` page with two dropzones: labels + paired CSV/JSON
- [ ] R-004: CSV and JSON paired import:
  - CSV columns match `ApplicationData` schema (downloadable template at `/api/template/csv`)
  - JSON: array of `{ filename: string, expected: ApplicationData }`
  - Pair labels to expected-data rows by filename (case-insensitive, extension-agnostic match)
  - Unpaired labels show as `Needs expected data — paste manually or skip`
  - Paired rows render in the queue with thumbnail + filename + brand
- [ ] Soft-warn at 50 files: confirmation modal showing "~$X.XX estimate, ~Y min ETA. Continue?" with [Cancel] [Start]
- [ ] Hard cap: 250 files; UI rejects over-cap drops with "Trim to 250" / "Cancel"
- [ ] Web Worker pool (`lib/workers/extraction-pool.ts`) of 10 workers; each worker processes one file via `/api/extract-label`; main thread orchestrates queue
- [ ] `bottleneck` rate-limiter to respect OpenRouter rate limits (per-provider; e.g. 100 req/min default)
- [ ] Per-file progress: `Queued → Processing → Complete | Failed | Manual Review | Request Better Image` reflected live in the table row
- [ ] Filterable result table: by status, by beverage, by has-failures, by reviewer-overridden
- [ ] Retry failed: per-row retry button + bulk "Retry all failed"
- [ ] Open per-label detail view inline (modal or accordion) with full FieldResults + image + bbox highlights
- [ ] R-014 extension: batch saved to IndexedDB via `db.batch` + each per-label review goes to `db.review`; relationship is `Batch.reviewIds`
- [ ] Batch summary panel (PRD §9.2): total / completed / passed / warnings / failed / manual-review / quality-issues / avg-time / total-time
- [ ] Tab close mid-batch: per-label results that have completed are still in IndexedDB; document this as a limitation in the README
- [ ] All quality gates green
- [ ] `STUDY_GUIDE.md` updated: "How the Web Worker pool works" + "Why we cap at 250"

## Files to touch
- **Create:** `app/batch/page.tsx`
- **Create:** `app/api/template/csv/route.ts` (returns CSV template stream)
- **Create:** `lib/workers/extraction-pool.ts` (typed pool wrapper)
- **Create:** `lib/workers/extract-worker.ts` (the worker file)
- **Create:** `lib/batch/pair.ts` (filename pairing logic)
- **Create:** `lib/batch/csv.ts` (papaparse-based CSV reader → ApplicationData[])
- **Create:** `lib/batch/json.ts` (JSON paired reader)
- **Create:** `components/BatchDropzone.tsx`
- **Create:** `components/BatchQueue.tsx` (per-row + filters + retry)
- **Create:** `components/BatchSummaryPanel.tsx`
- **Create:** `components/BatchDetailModal.tsx` (per-label drill-in)
- **Modify:** `lib/storage/batch-repo.ts` (add batch + per-review writes in a transaction)
- **Modify:** `app/page.tsx` (link to /batch)

## Test specs (write first per TDD)
1. `lib/batch/pair.test.ts` — case-insensitive + extension-agnostic filename matching; unpaired flagged correctly; collisions resolved by first-match with warning.
2. `lib/batch/csv.test.ts` — parse template CSV → ApplicationData[]; reject malformed rows with line numbers.
3. `lib/batch/json.test.ts` — parse JSON; reject schema violations with field paths.
4. `lib/workers/extraction-pool.test.ts` — pool of 10 processes 30 jobs; respects max concurrency; failed jobs surface to caller; retry-failed re-queues.
5. `components/BatchDropzone.test.tsx` — RTL: dropping > 250 files shows trim modal; dropping ≥ 50 shows confirmation modal.
6. `components/BatchQueue.test.tsx` — RTL: filter by status, retry single row, retry all failed.
7. `lib/storage/batch-repo.test.ts` — batch + reviews written transactionally; reading batch hydrates all per-review records.
8. `test/e2e/batch.spec.ts` — drop 5 demo labels + CSV → see queue → wait for completion → see summary; retry a failed row.

## Notes
- Web Workers can't access IndexedDB directly without a wrapper; main thread mediates writes.
- For CSV: provide downloadable template at `/api/template/csv` so users can fill correctly.
- Hard cap 250 + 10 concurrent at ~5s/label = ~125s minimum for full 250-file batch.
- The Web Worker pool runs in the browser; each worker fetches `/api/extract-label`. The server endpoint is stateless per slice 2 contract.
- `bottleneck` runs in the main thread (not in workers) to coordinate the rate limit across all workers.
- Document tab-close limitation in `README.md` "Known limitations" + `STUDY_GUIDE.md` "Things that don't work well".
