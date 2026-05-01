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
  "review_id",
  "filename",
  "field_name",
  "expected",
  "extracted",
  "status",
  "confidence",
  "ai_status",
  "human_status",
  "override_reason",
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

interface PerFieldRow {
  review_id: string;
  filename: string;
  field_name: string;
  expected: string;
  extracted: string;
  status: string;
  confidence: string;
  ai_status: string;
  human_status: string;
  override_reason: string;
}

function rowFor(review: Review, fr: FieldResult): PerFieldRow {
  return {
    review_id: review.id,
    filename: syntheticFilename(review),
    field_name: fr.field,
    expected: fmtCellValue(fr.expected),
    extracted: fmtCellValue(fr.value),
    status: fr.status,
    confidence: fr.confidence.toFixed(2),
    ai_status: fr.humanOverride?.originalAiStatus ?? "",
    human_status: fr.humanOverride?.humanStatus ?? "",
    override_reason: fr.humanOverride?.reason ?? "",
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
