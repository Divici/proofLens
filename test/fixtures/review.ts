/**
 * Shared `Review` fixture builder for export tests.
 *
 * `makeReviewFixture()` returns a deterministic Review record so PDF / CSV /
 * JSON / ZIP tests can assert against stable values. Override individual
 * keys via the `overrides` arg.
 */

import type { ApplicationData, ExtractedLabelData } from "@/lib/ai/schema";
import type { FieldResult } from "@/lib/verify/types";
import type { Review, Batch } from "@/lib/storage/types";
import { CURRENT_RULES_VERSION } from "@/lib/storage/types";

const TINY_JPEG_BYTES = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

export function makeThumbnailBlob(): Blob {
  return new Blob([TINY_JPEG_BYTES], { type: "image/jpeg" });
}

export function makeExpected(): ApplicationData {
  return {
    brand: "Old Tom Distillery",
    classType: "Kentucky Straight Bourbon Whiskey",
    abv: 45,
    netContents: "750 mL",
    bottlerName: "Old Tom Distillery LLC",
    bottlerAddress: "123 Bourbon Lane, Bardstown, KY 40004",
    countryOfOrigin: "United States",
    govWarningRequired: true,
    applicationNotes: "TTB-2026-00001",
    beverageType: "distilled-spirits",
  };
}

export function makeExtracted(): ExtractedLabelData {
  const f = (value: string | null) => ({
    value,
    evidenceQuote: value,
    confidence: 0.92,
  });
  return {
    brand: f("Old Tom Distillery"),
    classType: f("Kentucky Straight Bourbon Whiskey"),
    alcoholContentText: f("45% ALC./VOL."),
    abvPercent: { value: 45, evidenceQuote: "45%", confidence: 0.92 },
    proof: { value: 90, evidenceQuote: "90 Proof", confidence: 0.92 },
    netContents: f("750 mL"),
    bottlerName: f("Old Tom Distillery LLC"),
    bottlerAddress: f("123 Bourbon Lane, Bardstown, KY 40004"),
    countryOfOrigin: f("United States"),
    governmentWarningText: f(
      "GOVERNMENT WARNING: (1) According to the Surgeon General...",
    ),
    rawText: "OLD TOM DISTILLERY",
    imageQualityNotes: [],
    extractionConfidence: 0.92,
  };
}

export function makeFieldResults(): FieldResult[] {
  return [
    {
      field: "brand",
      label: "Brand name",
      status: "pass",
      value: "Old Tom Distillery",
      expected: "Old Tom Distillery",
      confidence: 0.95,
      explanation: "Brand matches expected.",
      suggestedAction: "No action needed.",
      evidenceQuote: "OLD TOM DISTILLERY",
      bbox: null,
      outcomes: [],
    },
    {
      field: "abv",
      label: "Alcohol content",
      status: "pass",
      value: 45,
      expected: 45,
      confidence: 0.92,
      explanation: "ABV within tolerance.",
      suggestedAction: "No action needed.",
      evidenceQuote: "45% ALC./VOL.",
      bbox: null,
      outcomes: [],
    },
    {
      field: "netContents",
      label: "Net contents",
      status: "warning",
      value: "750 mL",
      expected: "750 mL",
      confidence: 0.78,
      explanation: "Volume readable but tight tolerance.",
      suggestedAction: "Verify on-label printing.",
      evidenceQuote: "750 mL",
      bbox: null,
      outcomes: [],
    },
    {
      field: "governmentWarning",
      label: "Government warning",
      status: "fail",
      value: "GOVERNMENT WARNING: (1) ...",
      expected: "REQUIRED",
      confidence: 0.6,
      explanation: "Wording mismatch versus 27 CFR § 16.21.",
      suggestedAction: "Reject — request artwork rework.",
      evidenceQuote: "GOVERNMENT WARNING: (1) According to the Surgeon General",
      bbox: null,
      outcomes: [],
    },
  ];
}

export function makeReviewFixture(overrides: Partial<Review> = {}): Review {
  const fieldResults = overrides.fieldResults ?? makeFieldResults();
  const expectedData = overrides.expectedData ?? makeExpected();
  return {
    id: "review-fixture-id",
    createdAt: "2026-04-29T12:00:00.000Z",
    reviewerName: "Jane Doe",
    beverageType: "spirits",
    rulesVersion: CURRENT_RULES_VERSION,
    expectedData,
    extracted: overrides.extracted ?? makeExtracted(),
    fieldResults,
    overall: overrides.overall ?? "fail",
    imageQualityFlags: [],
    thumbnail: overrides.thumbnail ?? makeThumbnailBlob(),
    bboxes: {},
    rawText: "OLD TOM DISTILLERY 45% ALC./VOL. 750 mL",
    decision: overrides.decision ?? {
      decision: "rejected",
      notes: "Government warning wording does not match § 16.21.",
      reviewerName: "Jane Doe",
      timestamp: "2026-04-29T12:05:00.000Z",
    },
    processingTimeMs: 1234,
    aiSpend: { primaryUsd: 0.0021, fallbackUsd: 0 },
    ocrConfidence: 0.92,
    imageWidth: 1568,
    imageHeight: 1176,
    brand: expectedData.brand,
    hasOverrides: fieldResults.some((fr) => Boolean(fr.humanOverride)),
    ...overrides,
  };
}

export function makeBatchFixture(reviews: Review[]): Batch {
  return {
    id: "batch-fixture-id",
    createdAt: "2026-04-29T12:30:00.000Z",
    reviewerName: "Jane Doe",
    reviewIds: reviews.map((r) => r.id),
    status: "complete",
    summary: {
      total: reviews.length,
      pass: reviews.filter((r) => r.overall === "pass").length,
      fail: reviews.filter((r) => r.overall === "fail").length,
      needsManualReview: reviews.filter(
        (r) => r.overall === "needs-manual-review",
      ).length,
      requestBetterImage: reviews.filter(
        (r) => r.overall === "request-better-image",
      ).length,
      passWithWarnings: reviews.filter(
        (r) => r.overall === "pass-with-warnings",
      ).length,
      failures: 0,
      qualityIssues: 0,
      avgProcessingTimeMs:
        reviews.length === 0
          ? 0
          : reviews.reduce((s, r) => s + r.processingTimeMs, 0) /
            reviews.length,
      totalDurationMs: 5000,
    },
    title: `${reviews.length} labels`,
  };
}
