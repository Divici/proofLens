import type { ExtractLabelResponseShape } from "@/lib/workers/extract-worker";
import type { BatchSummary } from "@/lib/storage/types";

/**
 * Pure helpers for the batch flow: cost + ETA estimates, summary
 * aggregation, ETA formatting, and the locked threshold constants.
 *
 * Splitting this out keeps the React components dumb (props in,
 * elements out) and makes the soft-warn / summary panels trivial to
 * unit-test.
 */

/** Soft confirmation modal fires at or above this file count. */
export const SOFT_WARN_THRESHOLD = 50;

/** Hard cap — drops over this trigger the trim modal. */
export const HARD_CAP = 250;

/**
 * Rough per-label spend forecast — `lib/ai/pricing.ts` lists ~$0.010
 * blended per file (Haiku + occasional Sonnet + LLM-judge). The number
 * we surface to reviewers is intentionally rounded so they understand
 * it's an estimate, not a quote.
 */
const PER_FILE_USD = 0.01;

/** Per-label p50 latency, ms (PRESEARCH §5.4). */
const PER_FILE_LATENCY_MS = 5_000;

export function estimateCostUsd(fileCount: number): number {
  return Math.max(0, fileCount) * PER_FILE_USD;
}

export function estimateDurationMs(
  fileCount: number,
  concurrency: number,
): number {
  if (fileCount <= 0 || concurrency <= 0) return 0;
  const batches = Math.ceil(fileCount / concurrency);
  return batches * PER_FILE_LATENCY_MS;
}

/** Formats a duration into a human-readable "~X min Y s" / "~X s" string. */
export function formatEta(ms: number): string {
  if (ms <= 0) return "~0 s";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `~${totalSeconds} s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) return `~${minutes} min`;
  return `~${minutes} min ${seconds} s`;
}

export interface CompletedItemShape {
  ok: true;
  response: ExtractLabelResponseShape;
}

export type SummaryItem = CompletedItemShape | { ok: false };

/**
 * Aggregate per-file results into the `BatchSummary` shape. `failures`
 * counts files that errored out completely; `qualityIssues` counts files
 * where at least one image-quality flag fired regardless of overall
 * status. Avg time is computed only over successes since failures
 * skew toward zero (network errors return immediately).
 */
export function buildBatchSummary(
  items: ReadonlyArray<SummaryItem>,
  totalDurationMs: number,
): BatchSummary {
  let pass = 0;
  let fail = 0;
  let needsManualReview = 0;
  let requestBetterImage = 0;
  let passWithWarnings = 0;
  let failures = 0;
  let qualityIssues = 0;
  let totalProcMs = 0;
  let successCount = 0;

  for (const item of items) {
    if (!item.ok) {
      failures += 1;
      continue;
    }
    successCount += 1;
    const r = item.response;
    totalProcMs += r.processingTimeMs;
    if (r.imageQualityFlags.length > 0) qualityIssues += 1;
    switch (r.overall) {
      case "pass":
        pass += 1;
        break;
      case "fail":
        fail += 1;
        break;
      case "needs-manual-review":
        needsManualReview += 1;
        break;
      case "request-better-image":
        requestBetterImage += 1;
        break;
      case "pass-with-warnings":
        passWithWarnings += 1;
        break;
    }
  }

  return {
    total: items.length,
    pass,
    fail,
    needsManualReview,
    requestBetterImage,
    passWithWarnings,
    failures,
    qualityIssues,
    avgProcessingTimeMs: successCount > 0 ? Math.round(totalProcMs / successCount) : 0,
    totalDurationMs,
  };
}
