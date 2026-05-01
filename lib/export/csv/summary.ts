import Papa from "papaparse";
import type { Batch, Review } from "@/lib/storage/types";

/**
 * Batch summary CSV (R-015).
 *
 * One row per review with the locked column order below. Generated via
 * `papaparse.unparse` so quoting + newlines in fields are RFC-4180 safe
 * without us hand-rolling escaping.
 *
 * The IDB schema (PRESEARCH §8.1) doesn't carry the original filename of
 * the uploaded label — the buffer is dropped at the end of the request.
 * To keep the CSV self-explanatory we synthesize a filename from the
 * brand slug + review id stub.
 */

export const SUMMARY_HEADERS = [
  "ID",
  "Filename",
  "Brand",
  "Beverage",
  "Overall status",
  "Completed at",
  "Reviewer",
  "Has overrides",
  "Processing time (ms)",
] as const;

function brandSlug(brand: string): string {
  return brand
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60);
}

function syntheticFilename(review: Review): string {
  const slug = brandSlug(review.brand) || "label";
  return `${slug}-${review.id.slice(0, 8)}.jpg`;
}

type SummaryRow = Record<(typeof SUMMARY_HEADERS)[number], string>;

export function renderBatchSummaryCsv(
  _batch: Batch,
  reviews: ReadonlyArray<Review>,
): string {
  const rows: SummaryRow[] = reviews.map((r) => ({
    ID: r.id,
    Filename: syntheticFilename(r),
    Brand: r.brand,
    Beverage: r.beverageType,
    "Overall status": r.overall,
    "Completed at": r.createdAt,
    Reviewer: r.reviewerName,
    "Has overrides": r.hasOverrides ? "true" : "false",
    "Processing time (ms)": String(r.processingTimeMs),
  }));

  return Papa.unparse(
    { fields: [...SUMMARY_HEADERS], data: rows },
    { quotes: false, newline: "\n" },
  );
}
