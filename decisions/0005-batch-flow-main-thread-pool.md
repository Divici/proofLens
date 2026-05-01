# 0005: Batch flow + main-thread extraction pool

**Date:** 2026-04-30
**Status:** accepted
**Slice:** 0007 (batch milestone)

## Context

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

## Decision

### Pool design

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

### Why main-thread (not Web Workers)

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

### Pairing CSV/JSON expected data

`lib/batch/csv.ts` and `lib/batch/json.ts` parse user-supplied
expected-data tables; `lib/batch/pair.ts` matches by
`filename` (case-insensitive, extension-agnostic) so a reviewer can
drop `bourbon-1.jpg` + `bourbon-1.json` and they pair automatically.

Unpaired labels surface as a "needs expected data" warning;
unmatched expected rows surface as a paired-row drop warning. Both
states are non-blocking so reviewers can proceed with the matched
subset.

### Hard cap and soft confirmation

- **Soft modal at 50 files** with cost+ETA estimate sourced from the
  per-row pricing computed by the cost helper.
- **Hard cap at 250 files**; over-cap drops show a "Trim to 250"
  modal that picks the first 250 in the dropped list.

### Atomic save at batch-completion

- `saveBatchWithReviews(batch, reviews)` opens a single IDB
  transaction across `db.review` and `db.batch` and writes every
  record in one shot. If the transaction aborts, no review lands —
  history doesn't get a half-batch ghost.

### Mid-batch exports (slice 0009)

Summary CSV / Per-field CSV are buildable off the in-memory `items[]`
without waiting for save (slice 0009 fix). PDF / JSON ZIPs still
require save-first because they read the persisted thumbnail Blob.

## Consequences

### Positive

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

### Negative

- **Tab close mid-batch loses unsaved rows.** Documented as a known
  limitation. A service worker queue would survive, at the cost of
  a much larger surface (worker scripts, message protocol,
  permission semantics, browser-by-browser quirks).
- Pool concurrency tuning lives in code (`POOL_CONCURRENCY = 10`).
  Runtime adjustment via env or settings is a future improvement.
- `Bottleneck` ships ~5 KB of vendor code we could replace with a
  hand-rolled limiter, but the dependency is well-tested and the
  size is acceptable.

### Deferred to later slices

- AbortSignal-driven cancellation surfaced in the UI (slice 0009 —
  not yet shipped).
- Per-batch cost-tracking history (slice 0009 nice-to-have).
- Cross-tab batch resume — out of scope under the IT note.

## References

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
