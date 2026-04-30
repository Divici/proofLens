import { describe, expect, it } from "vitest";
import { runVerificationPipeline } from "./pipeline";
import { GOV_WARNING_CANONICAL } from "./strict/gov-warning-canonical";
import type { ApplicationData, ExtractedLabelData } from "@/lib/ai/schema";
import type { TesseractWord } from "@/lib/ocr/tesseract";

const EXPECTED: ApplicationData = {
  brand: "Old Tom Distillery",
  classType: "Kentucky Straight Bourbon Whiskey",
  abv: 45,
  netContents: "750 mL",
  bottlerName: "Old Tom Distillery, LLC",
  bottlerAddress: "Bardstown, KY",
  countryOfOrigin: "United States",
  govWarningRequired: true,
  applicationNotes: "TTB-2026-00001",
  beverageType: "distilled-spirits",
};

function passingExtraction(): ExtractedLabelData {
  return {
    brand: { value: "Old Tom Distillery", evidenceQuote: "Old Tom Distillery", confidence: 0.96 },
    classType: {
      value: "Kentucky Straight Bourbon Whiskey",
      evidenceQuote: "Kentucky Straight Bourbon Whiskey",
      confidence: 0.92,
    },
    alcoholContentText: {
      value: "45% Alc./Vol.",
      evidenceQuote: "45% Alc./Vol.",
      confidence: 0.93,
    },
    abvPercent: { value: 45, evidenceQuote: "45%", confidence: 0.92 },
    proof: { value: 90, evidenceQuote: "(90 Proof)", confidence: 0.9 },
    netContents: { value: "750 mL", evidenceQuote: "750 mL", confidence: 0.95 },
    bottlerName: {
      value: "Old Tom Distillery, LLC",
      evidenceQuote: "Old Tom Distillery, LLC",
      confidence: 0.88,
    },
    bottlerAddress: {
      value: "Bardstown, KY",
      evidenceQuote: "Bardstown, KY",
      confidence: 0.85,
    },
    countryOfOrigin: {
      value: "United States",
      evidenceQuote: "Product of U.S.A.",
      confidence: 0.87,
    },
    governmentWarningText: {
      value: GOV_WARNING_CANONICAL,
      evidenceQuote: GOV_WARNING_CANONICAL,
      confidence: 0.94,
    },
    rawText: GOV_WARNING_CANONICAL,
    imageQualityNotes: [],
    extractionConfidence: 0.91,
  };
}

const WORDS: TesseractWord[] = [
  {
    text: "GOVERNMENT",
    confidence: 0.95,
    bbox: { x0: 100, y0: 800, x1: 280, y1: 830 },
  },
  {
    text: "WARNING",
    confidence: 0.95,
    bbox: { x0: 290, y0: 800, x1: 420, y1: 830 },
  },
  {
    text: "Old",
    confidence: 0.95,
    bbox: { x0: 100, y0: 100, x1: 140, y1: 130 },
  },
  {
    text: "Tom",
    confidence: 0.95,
    bbox: { x0: 150, y0: 100, x1: 200, y1: 130 },
  },
  {
    text: "Distillery",
    confidence: 0.92,
    bbox: { x0: 210, y0: 100, x1: 360, y1: 130 },
  },
];

describe("runVerificationPipeline", () => {
  it("returns Pass (or pass-with-warnings on alias-only fields) for the happy-path scenario", async () => {
    const result = await runVerificationPipeline({
      extracted: passingExtraction(),
      expected: EXPECTED,
      words: WORDS,
      rawText: `Old Tom Distillery\n${GOV_WARNING_CANONICAL}`,
      imageDims: { width: 1024, height: 1280 },
    });

    // "United States" vs "U.S.A." normalises to a Likely Match via the
    // alias table — that's a Pass-With-Warnings, not a Fail.
    expect(["pass", "pass-with-warnings"]).toContain(result.overall);
    expect(result.fieldResults.find((f) => f.field === "abv")?.status).toBe(
      "pass",
    );
    expect(
      result.fieldResults.find((f) => f.field === "governmentWarning")?.status,
    ).toBe("pass");
    // No strict fails on this scenario.
    const fails = result.fieldResults.filter((f) => f.status === "fail");
    expect(fails).toHaveLength(0);
  });

  it("returns Fail when ABV doesn't match expected", async () => {
    const e = passingExtraction();
    e.alcoholContentText = {
      value: "40% Alc./Vol.",
      evidenceQuote: "40% Alc./Vol.",
      confidence: 0.93,
    };
    e.abvPercent = { value: 40, evidenceQuote: "40%", confidence: 0.93 };

    const result = await runVerificationPipeline({
      extracted: e,
      expected: EXPECTED, // expects 45
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
    });
    expect(result.overall).toBe("fail");
    const abv = result.fieldResults.find((f) => f.field === "abv");
    expect(abv?.status).toBe("fail");
  });

  it("returns Fail when gov-warning prefix is lowercase", async () => {
    const e = passingExtraction();
    const lowerGov = GOV_WARNING_CANONICAL.replace(
      "GOVERNMENT WARNING:",
      "Government Warning:",
    );
    e.governmentWarningText = {
      value: lowerGov,
      evidenceQuote: "Government Warning",
      confidence: 0.94,
    };
    e.rawText = lowerGov;

    const result = await runVerificationPipeline({
      extracted: e,
      expected: EXPECTED,
      words: WORDS,
      rawText: lowerGov,
      imageDims: { width: 1024, height: 1280 },
    });

    expect(result.overall).toBe("fail");
    const gov = result.fieldResults.find(
      (f) => f.field === "governmentWarning",
    );
    expect(gov?.status).toBe("fail");
    expect(gov?.outcomes[0]?.kind).toBe("gov_warning_prefix_capitalization");
  });

  it("locates a bbox for the brand field via Tesseract words", async () => {
    const result = await runVerificationPipeline({
      extracted: passingExtraction(),
      expected: EXPECTED,
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
    });
    const brand = result.fieldResults.find((f) => f.field === "brand");
    expect(brand?.bbox).not.toBeNull();
    expect(brand?.bbox?.x0).toBe(100);
  });

  it("uses a short expected label for the gov-warning row instead of the full canonical body", async () => {
    const result = await runVerificationPipeline({
      extracted: passingExtraction(),
      expected: EXPECTED,
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
    });
    const gov = result.fieldResults.find(
      (f) => f.field === "governmentWarning",
    );
    // The short label keeps FieldRow's "Expected: ..." readable on narrow
    // viewports — the full canonical is still queryable via outcomes detail
    // when the audit log needs it.
    expect(gov?.expected).toBe("27 CFR § 16.21 verbatim text");
    expect(typeof gov?.expected).toBe("string");
    expect((gov?.expected as string).length).toBeLessThan(64);
  });

  it("treats gov-warning as not-required when the application says so", async () => {
    const result = await runVerificationPipeline({
      extracted: passingExtraction(),
      expected: { ...EXPECTED, govWarningRequired: false },
      words: WORDS,
      rawText: "",
      imageDims: { width: 1024, height: 1280 },
    });
    const gov = result.fieldResults.find(
      (f) => f.field === "governmentWarning",
    );
    expect(gov?.status).toBe("not-required");
  });
});

describe("runVerificationPipeline — beverage-aware routing (slice 0004)", () => {
  it("Other / Unknown beverage routes class/type/abv/bottler/country to not-required", async () => {
    const result = await runVerificationPipeline({
      extracted: passingExtraction(),
      expected: { ...EXPECTED, beverageType: "unknown" },
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
    });
    const byField = (key: string) =>
      result.fieldResults.find((f) => f.field === key);
    expect(byField("classType")?.status).toBe("not-required");
    expect(byField("abv")?.status).toBe("not-required");
    expect(byField("bottlerName")?.status).toBe("not-required");
    expect(byField("bottlerAddress")?.status).toBe("not-required");
    expect(byField("countryOfOrigin")?.status).toBe("not-required");
    // Universal fields still verified.
    expect(byField("brand")?.status).toBe("pass");
    expect(byField("netContents")?.status).toBe("pass");
  });

  it("wine ≤ 14% ABV missing on label is not a strict fail (Conditional → Optional)", async () => {
    const e = passingExtraction();
    // Wine label without an ABV statement — extraction returns null.
    e.alcoholContentText = { value: null, evidenceQuote: null, confidence: 0.9 };
    e.abvPercent = { value: null, evidenceQuote: null, confidence: 0.9 };

    const result = await runVerificationPipeline({
      extracted: e,
      expected: { ...EXPECTED, abv: 12, beverageType: "wine" },
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
    });
    const abv = result.fieldResults.find((f) => f.field === "abv");
    // Optional + missing should NOT strict-fail; flagged as not-required.
    expect(abv?.status).toBe("not-required");
  });

  it("image-quality flags demote a passing brand row to manual-review", async () => {
    const result = await runVerificationPipeline({
      extracted: passingExtraction(),
      expected: EXPECTED,
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
      imageQuality: { poor: true, flags: ["blur"] },
    });
    const brand = result.fieldResults.find((f) => f.field === "brand");
    expect(brand?.status).toBe("manual-review");
    expect(brand?.suggestedAction).toMatch(/request better image/i);
  });

  it("image-quality flags do NOT salvage a strict ABV fail", async () => {
    const e = passingExtraction();
    e.alcoholContentText = {
      value: "40% Alc./Vol.",
      evidenceQuote: "40% Alc./Vol.",
      confidence: 0.93,
    };
    e.abvPercent = { value: 40, evidenceQuote: "40%", confidence: 0.93 };
    const result = await runVerificationPipeline({
      extracted: e,
      expected: EXPECTED, // expects 45
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
      imageQuality: { poor: true, flags: ["blur", "glare"] },
    });
    const abv = result.fieldResults.find((f) => f.field === "abv");
    expect(abv?.status).toBe("fail");
  });
});
