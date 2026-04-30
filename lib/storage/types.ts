/**
 * IndexedDB shape (PRESEARCH §8.1) — browser-local persistence only.
 *
 * Per the IT note ("not storing anything sensitive for this exercise"),
 * server endpoints are stateless. Every saved review lives here in the
 * reviewer's browser.
 *
 * Stores:
 *   - `db.review`     — `Review[]`,  keyPath: `id` (uuid)
 *   - `db.batch`      — `Batch[]`,   keyPath: `id` (uuid)
 *   - `db.demoData`   — `DemoData[]`, keyPath: `scenarioId`
 *   - `db.settings`   — `Setting[]`, keyPath: `key`
 */

import type { ApplicationData, ExtractedLabelData } from "@/lib/ai/schema";
import type {
  BoundingBox,
  FieldResult,
  OverallStatus,
} from "@/lib/verify/types";
import type { ImageQualityFlag } from "@/lib/quality/types";

/** Marker type for ISO-8601 timestamp strings. */
export type ISO8601 = string;

/** Versioned ruleset identifier (PRESEARCH §8.1). */
export const CURRENT_RULES_VERSION = "ttb-2026-04-30" as const;

export type RulesVersion = typeof CURRENT_RULES_VERSION;

export type { FieldOverride } from "@/lib/verify/types";

export type ReviewBeverageType =
  | "beer"
  | "wine"
  | "spirits"
  | "unknown";

export interface HumanDecision {
  decision:
    | "approved"
    | "rejected"
    | "manual-review"
    | "request-better-image";
  notes: string;
  reviewerName: string;
  timestamp: ISO8601;
}

/**
 * IndexedDB review record. Mirrors PRESEARCH §8.1 with the
 * `humanOverride` extension on `FieldResult`. `thumbnail` is a 256-px JPEG
 * Blob generated client-side at save time (Canvas resize).
 */
export interface Review {
  id: string;
  createdAt: ISO8601;
  reviewerName: string;
  beverageType: ReviewBeverageType;
  rulesVersion: RulesVersion;
  expectedData: ApplicationData;
  extracted: ExtractedLabelData;
  fieldResults: FieldResult[];
  overall: OverallStatus;
  imageQualityFlags: ImageQualityFlag[];
  thumbnail: Blob;
  bboxes: Record<string, BoundingBox[]>;
  rawText: string;
  decision: HumanDecision | undefined;
  processingTimeMs: number;
  aiSpend: { primaryUsd: number; fallbackUsd: number };
  /**
   * OCR confidence reported by Tesseract.js for the original extraction.
   * Persisted so the reopen flow can surface the real confidence pill
   * rather than a fabricated default. Range: 0.0 – 1.0.
   */
  ocrConfidence: number;
  /**
   * Source image dimensions (after server-side preprocess). Persisted so
   * the bbox SVG overlay can scale correctly on reopen — without these,
   * the overlay would render against a 0×0 viewBox and be invisible.
   */
  imageWidth: number;
  imageHeight: number;
  /** Display name for the History list (brand from expectedData). */
  brand: string;
  /** True iff at least one fieldResult carries a humanOverride. */
  hasOverrides: boolean;
}

/** Slice 0007 placeholder — typed up-front so the schema is stable. */
export interface Batch {
  id: string;
  createdAt: ISO8601;
  reviewerName: string;
  reviewIds: string[];
  status: "queued" | "processing" | "complete" | "partial-failed";
  summary: {
    total: number;
    pass: number;
    fail: number;
    needsManualReview: number;
    requestBetterImage: number;
    passWithWarnings: number;
  };
}

/** Free-form string-keyed settings store. */
export interface Setting<T = unknown> {
  key: string;
  value: T;
}

/** Slice 0006 demo-data store placeholder. */
export interface DemoData {
  scenarioId: string;
  payload: unknown;
}

/** Mapping from `ApplicationData.beverageType` to the IDB-flavoured enum. */
export function toReviewBeverageType(
  beverage: ApplicationData["beverageType"],
): ReviewBeverageType {
  switch (beverage) {
    case "distilled-spirits":
      return "spirits";
    case "wine":
      return "wine";
    case "malt-beverage":
      return "beer";
    case "unknown":
      return "unknown";
  }
}
