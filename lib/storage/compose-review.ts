import type {
  ApplicationData,
  ExtractedLabelData,
} from "@/lib/ai/schema";
import type {
  BoundingBox,
  FieldResult,
  OverallStatus,
} from "@/lib/verify/types";
import type { ImageQualityFlag } from "@/lib/quality/types";
import {
  CURRENT_RULES_VERSION,
  type HumanDecision,
  type Review,
  toReviewBeverageType,
} from "./types";

/**
 * Pure helper that builds a `Review` IDB record from the in-memory
 * `/review` page state plus a freshly-generated thumbnail Blob.
 *
 * Kept side-effect-free (no `crypto.randomUUID()`, no `Date.now()`) so
 * tests can pass deterministic values. The page wires
 * `crypto.randomUUID()` and `() => new Date()` at the call site.
 */

export interface ComposeReviewArgs {
  id: string;
  now: () => Date;
  reviewerName: string;
  expectedData: ApplicationData;
  extracted: ExtractedLabelData;
  fieldResults: FieldResult[];
  overall: OverallStatus;
  imageQualityFlags: ImageQualityFlag[];
  thumbnail: Blob;
  rawText: string;
  processingTimeMs: number;
  aiSpend: { primaryUsd: number; fallbackUsd?: number };
  ocrConfidence: number;
  imageWidth: number;
  imageHeight: number;
  decision?: HumanDecision;
}

export function composeReview(args: ComposeReviewArgs): Review {
  const bboxes: Record<string, BoundingBox[]> = {};
  for (const fr of args.fieldResults) {
    if (fr.bbox) bboxes[fr.field] = [fr.bbox];
  }
  const hasOverrides = args.fieldResults.some((fr) => Boolean(fr.humanOverride));

  return {
    id: args.id,
    createdAt: args.now().toISOString(),
    reviewerName: args.reviewerName.trim(),
    beverageType: toReviewBeverageType(args.expectedData.beverageType),
    rulesVersion: CURRENT_RULES_VERSION,
    expectedData: args.expectedData,
    extracted: args.extracted,
    fieldResults: args.fieldResults,
    overall: args.overall,
    imageQualityFlags: args.imageQualityFlags,
    thumbnail: args.thumbnail,
    bboxes,
    rawText: args.rawText,
    decision: args.decision,
    processingTimeMs: args.processingTimeMs,
    aiSpend: {
      primaryUsd: args.aiSpend.primaryUsd,
      fallbackUsd: args.aiSpend.fallbackUsd ?? 0,
    },
    ocrConfidence: args.ocrConfidence,
    imageWidth: args.imageWidth,
    imageHeight: args.imageHeight,
    brand: args.expectedData.brand,
    hasOverrides,
  };
}
