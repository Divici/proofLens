import { describe, expect, it } from "vitest";
import {
  buildBatchSummary,
  estimateCostUsd,
  estimateDurationMs,
  formatEta,
  HARD_CAP,
  SOFT_WARN_THRESHOLD,
} from "./state";
import type { ExtractLabelResponseShape } from "@/lib/workers/extract-worker";

const completedShape = (
  overrides: Partial<ExtractLabelResponseShape> = {},
): ExtractLabelResponseShape => ({
  extracted: {
    brand: { value: null, evidenceQuote: null, confidence: 0 },
    classType: { value: null, evidenceQuote: null, confidence: 0 },
    alcoholContentText: { value: null, evidenceQuote: null, confidence: 0 },
    abvPercent: { value: null, evidenceQuote: null, confidence: 0 },
    proof: { value: null, evidenceQuote: null, confidence: 0 },
    netContents: { value: null, evidenceQuote: null, confidence: 0 },
    bottlerName: { value: null, evidenceQuote: null, confidence: 0 },
    bottlerAddress: { value: null, evidenceQuote: null, confidence: 0 },
    countryOfOrigin: { value: null, evidenceQuote: null, confidence: 0 },
    governmentWarningText: { value: null, evidenceQuote: null, confidence: 0 },
    rawText: "",
    imageQualityNotes: [],
    extractionConfidence: 0,
  },
  expected: {
    brand: "",
    classType: "",
    abv: 40,
    netContents: "750 mL",
    bottlerName: "",
    bottlerAddress: "",
    countryOfOrigin: "",
    govWarningRequired: true,
    applicationNotes: "",
    beverageType: "distilled-spirits",
  },
  rawText: "",
  fieldResults: [],
  overall: "pass",
  processingTimeMs: 1000,
  aiSpend: { primaryUsd: 0.001, fallbackUsd: 0 },
  ocrConfidence: 0.9,
  imageWidth: 100,
  imageHeight: 100,
  imageQualityFlags: [],
  imageQualityPoor: false,
  ...overrides,
});

describe("estimateCostUsd", () => {
  it("uses ~$0.010 per file as the rough heuristic", () => {
    expect(estimateCostUsd(0)).toBe(0);
    expect(estimateCostUsd(50)).toBeCloseTo(0.5, 2);
    expect(estimateCostUsd(250)).toBeCloseTo(2.5, 2);
  });
});

describe("estimateDurationMs", () => {
  it("uses ~5 s/file divided by concurrency", () => {
    // 30 files at 10 concurrent ≈ 3 batches × 5 s = 15 s.
    expect(estimateDurationMs(30, 10)).toBe(15_000);
  });

  it("rounds up partial batches", () => {
    // 31 files at 10 concurrent → 4 batches × 5 s = 20 s.
    expect(estimateDurationMs(31, 10)).toBe(20_000);
  });

  it("returns 0 for empty input", () => {
    expect(estimateDurationMs(0, 10)).toBe(0);
  });
});

describe("formatEta", () => {
  it("formats sub-minute durations as seconds", () => {
    expect(formatEta(15_000)).toBe("~15 s");
    expect(formatEta(45_000)).toBe("~45 s");
  });
  it("formats minute-scale durations", () => {
    expect(formatEta(75_000)).toBe("~1 min 15 s");
    expect(formatEta(125_000)).toBe("~2 min 5 s");
  });
});

describe("buildBatchSummary", () => {
  it("counts pass / fail / manual-review / quality / failures", () => {
    const items = [
      { ok: true, response: completedShape({ overall: "pass" }) },
      {
        ok: true,
        response: completedShape({
          overall: "fail",
          imageQualityFlags: ["blur"] as const,
          imageQualityPoor: true,
        }),
      },
      { ok: true, response: completedShape({ overall: "needs-manual-review" }) },
      { ok: true, response: completedShape({ overall: "request-better-image" }) },
      { ok: true, response: completedShape({ overall: "pass-with-warnings" }) },
      { ok: false as const },
    ];
    const summary = buildBatchSummary(items, 12_000);
    expect(summary.total).toBe(6);
    expect(summary.pass).toBe(1);
    expect(summary.fail).toBe(1);
    expect(summary.needsManualReview).toBe(1);
    expect(summary.requestBetterImage).toBe(1);
    expect(summary.passWithWarnings).toBe(1);
    expect(summary.failures).toBe(1);
    expect(summary.qualityIssues).toBe(1);
    expect(summary.totalDurationMs).toBe(12_000);
    // 5 successes × 1000 ms each = 1000 ms average.
    expect(summary.avgProcessingTimeMs).toBe(1000);
  });

  it("returns zeros for an empty batch", () => {
    const summary = buildBatchSummary([], 0);
    expect(summary.total).toBe(0);
    expect(summary.avgProcessingTimeMs).toBe(0);
  });
});

describe("constants", () => {
  it("matches the locked PRD §9.2 numbers", () => {
    expect(SOFT_WARN_THRESHOLD).toBe(50);
    expect(HARD_CAP).toBe(250);
  });
});
