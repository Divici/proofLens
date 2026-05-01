/**
 * Browser-side concurrent job pool for batch extraction (R-002, R-017).
 *
 * The pool is transport-agnostic: it accepts a `JobRunner` callback and
 * orchestrates up to `concurrency` runs at once with an optional minimum
 * spacing between job starts (rate-limit). The Web Worker wiring lives
 * in `extract-worker.ts` + `useExtractionWorkerRunner` (the consumer
 * provides the runner). This shape lets us unit-test the pool in jsdom
 * without spinning up real workers.
 *
 * Design notes:
 *   • `runAll` resolves only after every job has either returned a value
 *     or thrown — failures are surfaced as `{ ok: false, error }`
 *     entries, never as rejected promises. Reviewers should never see
 *     "an entire batch failed" because of one transient error.
 *   • `abort()` signals every in-flight runner via the per-job
 *     `AbortSignal`. Runners that respect the signal will reject
 *     promptly; their results are recorded as failures.
 *   • `subscribe(fn)` lets the UI stream live `start | complete | error`
 *     events into the queue table without polling.
 */

export interface ExtractionJob<TPayload, _TResult> {
  /** Stable id for cross-referencing UI rows. */
  id: string;
  payload: TPayload;
}

export type ExtractionResult<TResult> =
  | { ok: true; id: string; value: TResult; durationMs: number }
  | { ok: false; id: string; error: string; durationMs: number };

export type JobRunner<TPayload, TResult> = (
  job: ExtractionJob<TPayload, TResult>,
  signal: AbortSignal,
) => Promise<TResult>;

export interface PoolEvent<TResult> {
  kind: "start" | "complete" | "error";
  id: string;
  /** Only present for `complete`. */
  result?: TResult;
  /** Only present for `error`. */
  error?: string;
  /** Wall-clock duration since the job started (ms). 0 for `start`. */
  durationMs: number;
}

export interface ExtractionPoolOptions<TPayload, TResult> {
  /** Max in-flight runners. Default 10. */
  concurrency?: number;
  runner: JobRunner<TPayload, TResult>;
  /**
   * Optional minimum interval between successive job starts, in ms. This
   * is the lightweight rate-limit hook used as a Bottleneck stand-in
   * (Bottleneck's main-thread integration with Web Workers added more
   * complexity than value for this slice). Defaults to 0 (no spacing).
   */
  minIntervalMs?: number;
}

export interface ExtractionPool<TPayload, TResult> {
  runAll(
    jobs: ReadonlyArray<ExtractionJob<TPayload, TResult>>,
  ): Promise<ExtractionResult<TResult>[]>;
  abort(): void;
  subscribe(handler: (evt: PoolEvent<TResult>) => void): () => void;
}

export function createExtractionPool<TPayload, TResult>(
  options: ExtractionPoolOptions<TPayload, TResult>,
): ExtractionPool<TPayload, TResult> {
  const concurrency = Math.max(1, options.concurrency ?? 10);
  const minIntervalMs = Math.max(0, options.minIntervalMs ?? 0);

  const subscribers = new Set<(evt: PoolEvent<TResult>) => void>();
  let abortController = new AbortController();

  const emit = (evt: PoolEvent<TResult>): void => {
    for (const fn of subscribers) {
      try {
        fn(evt);
      } catch (cause) {
        // Subscriber bugs must not break the pool.
        console.error("[extraction-pool] subscriber threw", cause);
      }
    }
  };

  return {
    subscribe(handler) {
      subscribers.add(handler);
      return () => {
        subscribers.delete(handler);
      };
    },

    abort() {
      abortController.abort();
    },

    async runAll(jobs) {
      // Reset the abort controller so multiple `runAll` calls don't share
      // a stale signal. Tests + the retry-failed flow rely on this.
      abortController = new AbortController();
      const signal = abortController.signal;

      const results = new Array<ExtractionResult<TResult>>(jobs.length);
      let cursor = 0;
      let nextEarliestStart = 0; // performance.now() timestamp.

      // Serialized rate-limit gate. Slots line up here so the
      // min-interval is enforced across the pool, not per-slot.
      let rateChain: Promise<void> = Promise.resolve();
      const acquireRateSlot = (): Promise<void> => {
        if (minIntervalMs <= 0) return Promise.resolve();
        const next = rateChain.then(async () => {
          const now = performance.now();
          const wait = Math.max(0, nextEarliestStart - now);
          if (wait > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, wait));
          }
          nextEarliestStart = performance.now() + minIntervalMs;
        });
        rateChain = next;
        return next;
      };

      const launch = async (slot: number): Promise<void> => {
        while (cursor < jobs.length) {
          const myIndex = cursor;
          cursor += 1;
          const job = jobs[myIndex];
          if (!job) continue;

          await acquireRateSlot();

          const startedAt = performance.now();
          emit({ kind: "start", id: job.id, durationMs: 0 });

          if (signal.aborted) {
            results[myIndex] = {
              ok: false,
              id: job.id,
              error: "aborted before start",
              durationMs: 0,
            };
            emit({
              kind: "error",
              id: job.id,
              error: "aborted before start",
              durationMs: 0,
            });
            continue;
          }

          try {
            const value = await options.runner(job, signal);
            const durationMs = performance.now() - startedAt;
            results[myIndex] = { ok: true, id: job.id, value, durationMs };
            emit({ kind: "complete", id: job.id, result: value, durationMs });
          } catch (cause) {
            const durationMs = performance.now() - startedAt;
            const error =
              cause instanceof Error ? cause.message : String(cause);
            results[myIndex] = { ok: false, id: job.id, error, durationMs };
            emit({ kind: "error", id: job.id, error, durationMs });
          }
        }
        // Slot done; nothing else to do — the worker function returns
        // and `Promise.all` resolves once every slot has drained.
        void slot;
      };

      const slotCount = Math.min(concurrency, jobs.length);
      const slotPromises = Array.from({ length: slotCount }, (_, i) =>
        launch(i),
      );
      await Promise.all(slotPromises);
      return results;
    },
  };
}
