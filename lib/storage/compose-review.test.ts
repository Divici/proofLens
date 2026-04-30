import { describe, expect, it } from "vitest";
import { composeReview } from "./compose-review";
import type { ApplicationData, ExtractedLabelData } from "@/lib/ai/schema";
import type { FieldResult } from "@/lib/verify/types";

function makeExtracted(): ExtractedLabelData {
  const f = (value: string | null) => ({
    value,
    evidenceQuote: value,
    confidence: 0.9,
  });
  return {
    brand: f("Brand X"),
    classType: f("Vodka"),
    alcoholContentText: f("45%"),
    abvPercent: { value: 45, evidenceQuote: "45%", confidence: 0.9 },
    proof: { value: 90, evidenceQuote: "90 Proof", confidence: 0.9 },
    netContents: f("750 mL"),
    bottlerName: f("X Co."),
    bottlerAddress: f("Iowa"),
    countryOfOrigin: f("United States"),
    governmentWarningText: f("GOVERNMENT WARNING:"),
    rawText: "ANY",
    imageQualityNotes: [],
    extractionConfidence: 0.9,
  };
}

function makeExpected(): ApplicationData {
  return {
    brand: "Brand X",
    classType: "Vodka",
    abv: 45,
    netContents: "750 mL",
    bottlerName: "X Co.",
    bottlerAddress: "Iowa",
    countryOfOrigin: "United States",
    govWarningRequired: true,
    applicationNotes: "TEST",
    beverageType: "distilled-spirits",
  };
}

const fieldResults: FieldResult[] = [
  {
    field: "brand",
    label: "Brand name",
    status: "pass",
    value: "Brand X",
    expected: "Brand X",
    confidence: 0.95,
    explanation: "Match.",
    suggestedAction: "No action needed.",
    evidenceQuote: "BRAND X",
    bbox: null,
    outcomes: [],
  },
];

describe("composeReview", () => {
  it("builds a Review with brand and beverage type derived from expected", () => {
    const review = composeReview({
      id: "fixed-id",
      now: () => new Date("2026-04-29T12:00:00Z"),
      reviewerName: "Jane Doe",
      expectedData: makeExpected(),
      extracted: makeExtracted(),
      fieldResults,
      overall: "pass",
      imageQualityFlags: [],
      thumbnail: new Blob(["t"], { type: "image/jpeg" }),
      rawText: "ANY",
      processingTimeMs: 1000,
      aiSpend: { primaryUsd: 0.001, fallbackUsd: 0 },
    });
    expect(review.id).toBe("fixed-id");
    expect(review.brand).toBe("Brand X");
    expect(review.beverageType).toBe("spirits");
    expect(review.rulesVersion).toBe("ttb-2026-04-30");
    expect(review.hasOverrides).toBe(false);
    expect(review.createdAt).toBe("2026-04-29T12:00:00.000Z");
  });

  it("sets hasOverrides=true when any field carries a humanOverride", () => {
    const review = composeReview({
      id: "x",
      now: () => new Date(),
      reviewerName: "Jane Doe",
      expectedData: makeExpected(),
      extracted: makeExtracted(),
      fieldResults: [
        {
          ...fieldResults[0]!,
          humanOverride: {
            originalAiStatus: "pass",
            humanStatus: "fail",
            reason: "Bad colour.",
            timestamp: "2026-04-29T12:00:00Z",
            reviewerName: "Jane Doe",
          },
        },
      ],
      overall: "fail",
      imageQualityFlags: [],
      thumbnail: new Blob(["t"]),
      rawText: "ANY",
      processingTimeMs: 1000,
      aiSpend: { primaryUsd: 0.001, fallbackUsd: 0 },
    });
    expect(review.hasOverrides).toBe(true);
  });

  it("collects per-field bboxes into a stable record", () => {
    const review = composeReview({
      id: "x",
      now: () => new Date(),
      reviewerName: "Jane Doe",
      expectedData: makeExpected(),
      extracted: makeExtracted(),
      fieldResults: [
        {
          ...fieldResults[0]!,
          bbox: {
            x0: 1,
            y0: 2,
            x1: 3,
            y1: 4,
            imageWidth: 100,
            imageHeight: 100,
          },
        },
      ],
      overall: "pass",
      imageQualityFlags: [],
      thumbnail: new Blob(["t"]),
      rawText: "ANY",
      processingTimeMs: 1000,
      aiSpend: { primaryUsd: 0.001, fallbackUsd: 0 },
    });
    expect(review.bboxes.brand).toEqual([
      { x0: 1, y0: 2, x1: 3, y1: 4, imageWidth: 100, imageHeight: 100 },
    ]);
  });
});
