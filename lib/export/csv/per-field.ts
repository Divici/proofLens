import Papa from "papaparse";
import type { Review } from "@/lib/storage/types";
import type { FieldResult } from "@/lib/verify/types";

/**
 * Per-field CSV (R-015) — one row per (review × field).
 *
 * Includes the override audit columns (`ai_status`, `human_status`,
 * `override_reason`) so reviewers can analyse where humans disagreed
 * with the AI without opening every review.
 */

export const PER_FIELD_HEADERS = [
  "Review ID",
  "Filename",
  "Field name",
  "Expected",
  "Extracted",
  "Status",
  "Confidence",
  "AI status",
  "Human status",
  "Override reason",
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

function fmtCellValue(value: string | number | boolean | null): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

type PerFieldRow = Record<(typeof PER_FIELD_HEADERS)[number], string>;

function rowFor(review: Review, fr: FieldResult): PerFieldRow {
  return {
    "Review ID": review.id,
    Filename: syntheticFilename(review),
    "Field name": fr.field,
    Expected: fmtCellValue(fr.expected),
    Extracted: fmtCellValue(fr.value),
    Status: fr.status,
    Confidence: fr.confidence.toFixed(2),
    "AI status": fr.humanOverride?.originalAiStatus ?? "",
    "Human status": fr.humanOverride?.humanStatus ?? "",
    "Override reason": fr.humanOverride?.reason ?? "",
  };
}

export function renderPerFieldCsv(reviews: ReadonlyArray<Review>): string {
  const rows: PerFieldRow[] = [];
  for (const r of reviews) {
    for (const fr of r.fieldResults) rows.push(rowFor(r, fr));
  }
  return Papa.unparse(
    { fields: [...PER_FIELD_HEADERS], data: rows },
    { quotes: false, newline: "\n" },
  );
}
