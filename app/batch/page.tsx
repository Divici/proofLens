"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { BatchDropzone } from "@/components/BatchDropzone";
import { BatchQueue, type BatchQueueItem } from "@/components/BatchQueue";
import { BatchSummaryPanel } from "@/components/BatchSummaryPanel";
import { BatchDetailModal } from "@/components/BatchDetailModal";
import { ExportMenu } from "@/components/ExportMenu";
import { ProviderHealthBanner } from "@/components/ProviderHealthBanner";
import { Button } from "@/components/ui/button";
import {
  pairLabelsToExpected,
  type ExpectedRow,
} from "@/lib/batch/pair";
import { parseExpectedDataCsv } from "@/lib/batch/csv";
import { parseExpectedDataJson } from "@/lib/batch/json";
import {
  buildBatchSummary,
  composeBatchTitle,
  POOL_CONCURRENCY,
  type SummaryItem,
} from "@/lib/batch/state";
import {
  createExtractionPool,
  type ExtractionJob,
} from "@/lib/workers/extraction-pool";
import {
  extractLabelOnce,
  type ExtractLabelResponseShape,
} from "@/lib/workers/extract-worker";
import { composeReview } from "@/lib/storage/compose-review";
import { generateThumbnail } from "@/lib/image/thumbnail";
import {
  saveBatchWithReviews,
  hydrateBatch,
  type HydratedBatch,
} from "@/lib/storage/batch-repo";
import {
  getReviewerName,
  setReviewerName as persistReviewerName,
} from "@/lib/storage/settings-repo";
import type { Batch, Review } from "@/lib/storage/types";
import type { ApplicationData } from "@/lib/ai/schema";
import { loadDemoBatchManifest } from "@/lib/demo/scenarios";

interface PendingItem extends BatchQueueItem {
  /** Source File handed to the pool. */
  file: File;
}

// 100 req/min default per provider — keep slightly under so we don't
// hit a 429 before the rate-limit returns.
const RATE_LIMIT_MIN_INTERVAL_MS = 600;

export default function BatchPage() {
  const [labels, setLabels] = useState<File[]>([]);
  const [pairedRows, setPairedRows] = useState<ExpectedRow[]>([]);
  const [items, setItems] = useState<PendingItem[]>([]);
  const [running, setRunning] = useState(false);
  const [reviewerName, setReviewerNameState] = useState<string>("");
  const [batchStartedAt, setBatchStartedAt] = useState<number | null>(null);
  const [tickMs, setTickMs] = useState<number>(0);
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [savedBatchId, setSavedBatchId] = useState<string | null>(null);
  /**
   * Once the batch is persisted we hydrate the stored Batch + Review[]
   * pair so the export menu has the canonical IDB records (with
   * thumbnails) — using the in-memory `items` array would force the
   * export pipeline to re-run thumbnail generation and stitching.
   */
  const [hydrated, setHydrated] = useState<HydratedBatch | null>(null);

  // Refs sync via effect so we don't violate the
  // react-hooks/refs rule (refs must not be written during render).
  const itemsRef = useRef<PendingItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Pre-fill reviewer name (sticky from /review save).
  useEffect(() => {
    let cancelled = false;
    getReviewerName()
      .then((n) => {
        if (!cancelled && n) {
          setReviewerNameState(n);
        }
      })
      .catch(() => {
        // Non-fatal.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Tick a wall-clock timer while running so the summary panel's
  // total-duration counter ticks live without us calling
  // `performance.now()` in render (which the purity rule rejects).
  useEffect(() => {
    if (!running || batchStartedAt === null) return;
    const id = window.setInterval(() => {
      setTickMs(performance.now() - batchStartedAt);
    }, 250);
    return () => window.clearInterval(id);
  }, [running, batchStartedAt]);

  const handleLabelsAdded = useCallback((newFiles: File[]) => {
    setLabels((prev) => [...prev, ...newFiles]);
  }, []);

  const handlePairedTextLoaded = useCallback(
    (text: string, kind: "csv" | "json") => {
      const parsed =
        kind === "csv"
          ? parseExpectedDataCsv(text)
          : parseExpectedDataJson(text);
      if (parsed.errors.length > 0) {
        toast.error(parsed.errors[0] ?? "Could not parse paired data.");
      }
      setPairedRows(parsed.rows);
    },
    [],
  );

  const pairing = useMemo(
    () => pairLabelsToExpected(labels, pairedRows),
    [labels, pairedRows],
  );

  const handleClear = useCallback(() => {
    setLabels([]);
    setPairedRows([]);
    setItems([]);
    setBatchStartedAt(null);
    setTickMs(0);
    setSavedBatchId(null);
    setHydrated(null);
    setRunning(false);
  }, []);

  // Hydrate the persisted batch + reviews once the saved id lands so the
  // export menu has the canonical IDB records (with thumbnails) instead
  // of the in-memory queue items.
  useEffect(() => {
    if (!savedBatchId) return;
    let cancelled = false;
    hydrateBatch(savedBatchId)
      .then((h) => {
        if (!cancelled && h) setHydrated(h);
      })
      .catch((cause) => {
        console.error("[batch] hydrate failed", cause);
      });
    return () => {
      cancelled = true;
    };
  }, [savedBatchId]);

  const handleLoadDemo = useCallback(async () => {
    try {
      const manifest = await loadDemoBatchManifest();
      const fetched = await Promise.all(
        manifest.entries.map(async (entry) => {
          const res = await fetch(entry.labelPath);
          const blob = await res.blob();
          return new File([blob], entry.filename, {
            type: blob.type || "image/jpeg",
          });
        }),
      );
      setLabels(fetched);
      setPairedRows(
        manifest.entries.map((entry) => ({
          filename: entry.filename,
          expected: entry.expected,
        })),
      );
      toast.success(`Loaded ${manifest.entries.length} demo files.`);
    } catch (cause) {
      console.error("[batch] failed to load demo manifest", cause);
      toast.error("Could not load the demo batch.");
    }
  }, []);

  const runPool = useCallback(async (jobs: ReadonlyArray<PendingItem>) => {
    const pool = createExtractionPool<
      { file: File; expected: ApplicationData },
      ExtractLabelResponseShape
    >({
      concurrency: POOL_CONCURRENCY,
      minIntervalMs: RATE_LIMIT_MIN_INTERVAL_MS,
      runner: async (job, signal) => {
        return extractLabelOnce({
          file: job.payload.file,
          expected: job.payload.expected,
          signal,
        });
      },
    });
    const unsubscribe = pool.subscribe((evt) => {
      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== evt.id) return it;
          switch (evt.kind) {
            case "start":
              return { ...it, status: "processing" };
            case "complete": {
              const r = evt.result as ExtractLabelResponseShape;
              return {
                ...it,
                status: "complete",
                overall: r.overall,
                processingTimeMs: r.processingTimeMs,
                hasFailures: r.fieldResults.some((f) => f.status === "fail"),
                response: r,
                errorMessage: null,
              };
            }
            case "error":
              return {
                ...it,
                status: "failed",
                errorMessage: evt.error ?? "Unknown error.",
                processingTimeMs: evt.durationMs,
              };
          }
        }),
      );
    });

    const poolJobs: ExtractionJob<
      { file: File; expected: ApplicationData }
    >[] = jobs.map((j) => ({
      id: j.id,
      payload: { file: j.file, expected: j.expected },
    }));
    await pool.runAll(poolJobs);
    unsubscribe();
    setRunning(false);
  }, []);

  const startBatch = useCallback(async () => {
    if (pairing.paired.length === 0) {
      toast.error("Add label files and a paired CSV/JSON to start a batch.");
      return;
    }
    setRunning(true);
    setBatchStartedAt(performance.now());
    setSavedBatchId(null);

    const initial: PendingItem[] = pairing.paired.map((p, i) => ({
      id: `${Date.now()}-${i}-${p.filename}`,
      filename: p.filename,
      brand: p.expected.brand,
      beverageType: p.expected.beverageType,
      status: "queued",
      overall: null,
      errorMessage: null,
      processingTimeMs: 0,
      hasFailures: false,
      hasOverrides: false,
      expected: p.expected,
      response: null,
      file: p.file,
    }));
    setItems(initial);

    await runPool(initial);
  }, [pairing.paired, runPool]);

  const handleRetryFailed = useCallback(
    async (id: string) => {
      const target = itemsRef.current.find((i) => i.id === id);
      if (!target) return;
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, status: "queued", errorMessage: null }
            : it,
        ),
      );
      setRunning(true);
      await runPool([target]);
    },
    [runPool],
  );

  const handleRetryAll = useCallback(async () => {
    const failed = itemsRef.current.filter((i) => i.status === "failed");
    if (failed.length === 0) return;
    setItems((prev) =>
      prev.map((it) =>
        it.status === "failed"
          ? { ...it, status: "queued", errorMessage: null }
          : it,
      ),
    );
    setRunning(true);
    await runPool(failed);
  }, [runPool]);

  const completedCount = items.filter(
    (i) => i.status === "complete" || i.status === "failed",
  ).length;

  const summary = useMemo(() => {
    const summaryItems: SummaryItem[] = items.map((i) => {
      if (i.status === "complete" && i.response) {
        return { ok: true, response: i.response };
      }
      return { ok: false };
    });
    return buildBatchSummary(summaryItems, tickMs);
  }, [items, tickMs]);

  const allDone =
    items.length > 0 &&
    items.every((i) => i.status === "complete" || i.status === "failed");

  // Save the batch + reviews once everything finishes.
  useEffect(() => {
    if (!allDone || running || savedBatchId !== null) return;
    // Defensive: Start is gated on a non-empty reviewer name, so this
    // branch should never fire — but if it does, surface a toast so
    // reviewers don't lose their work silently.
    if (!reviewerName.trim()) {
      toast.error(
        "Add a reviewer name to save this batch — refresh will lose results.",
      );
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const batchId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `batch-${Date.now()}`;
        const reviews: Review[] = [];
        for (const it of itemsRef.current) {
          if (it.status !== "complete" || !it.response) continue;
          const thumbnail = await generateThumbnail(it.file);
          const reviewId =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `review-${Date.now()}-${it.id}`;
          const review = composeReview({
            id: reviewId,
            now: () => new Date(),
            extracted: it.response.extracted,
            expectedData: it.response.expected,
            rawText: it.response.rawText,
            fieldResults: it.response.fieldResults,
            overall: it.response.overall,
            imageQualityFlags: it.response.imageQualityFlags,
            thumbnail,
            processingTimeMs: it.response.processingTimeMs,
            aiSpend: it.response.aiSpend,
            ocrConfidence: it.response.ocrConfidence,
            imageWidth: it.response.imageWidth,
            imageHeight: it.response.imageHeight,
            reviewerName,
            decision: undefined,
          });
          reviews.push(review);
        }
        const firstItem = itemsRef.current[0];
        const batch: Batch = {
          id: batchId,
          createdAt: new Date().toISOString(),
          reviewerName,
          reviewIds: reviews.map((r) => r.id),
          status: summary.failures > 0 ? "partial-failed" : "complete",
          summary,
          title: composeBatchTitle({
            count: reviews.length,
            firstBrand: firstItem?.expected.brand ?? "",
            firstFilename: firstItem?.filename ?? "",
          }),
        };
        await saveBatchWithReviews(batch, reviews);
        if (cancelled) return;
        setSavedBatchId(batch.id);
        toast.success(
          `Batch saved — ${reviews.length} reviews available in your history.`,
        );
      } catch (cause) {
        console.error("[batch] save failed", cause);
        if (!cancelled) toast.error("Could not save the batch to history.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allDone, running, savedBatchId, reviewerName, summary]);

  const openItem = useMemo(
    () => items.find((i) => i.id === openDetailId) ?? null,
    [items, openDetailId],
  );

  /**
   * Stable id for the in-flight (unsaved) batch envelope. Lazy-init via
   * `useState` keeps the synthesized id stable across re-renders without
   * tripping the `react-hooks/refs` rule.
   */
  const [inflightBatchId] = useState<string>(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `inflight-${crypto.randomUUID()}`
      : `inflight-local`,
  );

  /**
   * Synthesize a Batch + Review[] from the in-memory items so CSV / JSON
   * summaries are exportable mid-batch (slice 0009 — slice 0008 deferral).
   * Thumbnails are placeholder zero-byte Blobs because the export paths
   * exposed by this snapshot — Summary CSV and Per-field CSV — never read
   * the thumbnail. PDF / ZIP rows are gated via `disablePdfExport`.
   *
   * `composeReview` accepts a `now` thunk so we can stay pure: the
   * envelope's `createdAt` is captured once when the user starts the
   * batch and pinned via `batchStartedAt`.
   */
  const inFlightExport = useMemo(() => {
    const completed = items.filter(
      (i) => i.status === "complete" && i.response,
    );
    if (completed.length === 0) return null;
    const startedIso =
      batchStartedAt !== null
        ? new Date(performance.timeOrigin + batchStartedAt).toISOString()
        : "1970-01-01T00:00:00.000Z";
    const reviews: Review[] = completed.map((it) => {
      const r = it.response!;
      return composeReview({
        id: it.id,
        now: () => new Date(startedIso),
        extracted: r.extracted,
        expectedData: r.expected,
        rawText: r.rawText,
        fieldResults: r.fieldResults,
        overall: r.overall,
        imageQualityFlags: r.imageQualityFlags,
        // Placeholder thumbnail; Summary / Per-field CSVs ignore it.
        thumbnail: new Blob([], { type: "image/jpeg" }),
        processingTimeMs: r.processingTimeMs,
        aiSpend: r.aiSpend,
        ocrConfidence: r.ocrConfidence,
        imageWidth: r.imageWidth,
        imageHeight: r.imageHeight,
        reviewerName: reviewerName || "—",
        decision: undefined,
      });
    });
    const first = completed[0];
    const batch: Batch = {
      id: inflightBatchId,
      createdAt: startedIso,
      reviewerName: reviewerName || "—",
      reviewIds: reviews.map((r) => r.id),
      status: running ? "processing" : "complete",
      summary,
      title: composeBatchTitle({
        count: reviews.length,
        firstBrand: first?.expected.brand ?? "",
        firstFilename: first?.filename ?? "",
      }),
    };
    return { batch, reviews };
  }, [items, reviewerName, running, summary, batchStartedAt, inflightBatchId]);

  // Persist reviewer name on change (debounced via effect).
  useEffect(() => {
    if (!reviewerName.trim()) return;
    void persistReviewerName(reviewerName.trim());
  }, [reviewerName]);


  return (
    <>
      <SiteNav />
      <main
        id="main"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6"
      >
        <ProviderHealthBanner />
        <header className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs uppercase tracking-wider">
            Batch verification
          </p>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Verify multiple labels
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Drop a folder of label images plus a paired CSV/JSON of expected
            application data. We&apos;ll process up to {POOL_CONCURRENCY} in
            parallel and stream live status to the queue.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Reviewer name:</span>
              <input
                value={reviewerName}
                onChange={(e) => setReviewerNameState(e.target.value)}
                placeholder="e.g. Jane Doe"
                aria-label="Reviewer name"
                className="border-input rounded-md border bg-background px-2 py-1 text-sm"
              />
            </label>
            <div className="flex items-center gap-2">
              {hydrated ? (
                <ExportMenu
                  mode="batch"
                  batch={hydrated.batch}
                  reviews={hydrated.reviews}
                />
              ) : inFlightExport ? (
                /**
                 * In-progress / unsaved batch — Summary CSV and Per-field
                 * CSV are available straight away. PDFs and JSON ZIPs
                 * still require save-first because they need the
                 * persisted thumbnail Blob.
                 */
                <ExportMenu
                  mode="batch"
                  batch={inFlightExport.batch}
                  reviews={inFlightExport.reviews}
                  disablePdfExport
                />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled
                  aria-disabled="true"
                  title="Process at least one label to enable exports."
                >
                  Export
                </Button>
              )}
              {savedBatchId ? (
                <span className="text-xs text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  Saved to history
                </span>
              ) : null}
            </div>
          </div>

          <BatchDropzone
            labels={labels}
            pairedRows={pairedRows}
            warnings={pairing.warnings}
            onLabelsAdded={handleLabelsAdded}
            onPairedTextLoaded={handlePairedTextLoaded}
            onClear={handleClear}
            onStart={startBatch}
            starting={running}
            onLoadDemo={handleLoadDemo}
            startDisabledReason={
              reviewerName.trim()
                ? null
                : "Enter a reviewer name above to start the batch."
            }
          />

          {pairing.unpairedLabels.length > 0 ? (
            <p className="text-amber-700 dark:text-amber-300 text-xs">
              {pairing.unpairedLabels.length} label
              {pairing.unpairedLabels.length === 1 ? "" : "s"} need expected
              data — paste a CSV/JSON row or skip them.
            </p>
          ) : null}
        </section>

        {items.length > 0 ? (
          <>
            <BatchSummaryPanel
              summary={summary}
              completed={completedCount}
              total={items.length}
              running={running}
            />

            <BatchQueue
              items={items}
              onRetryFailed={handleRetryFailed}
              onRetryAll={handleRetryAll}
              onOpenDetail={(id) => setOpenDetailId(id)}
            />
          </>
        ) : null}

        <BatchDetailModal item={openItem} onClose={() => setOpenDetailId(null)} />
      </main>
    </>
  );
}
