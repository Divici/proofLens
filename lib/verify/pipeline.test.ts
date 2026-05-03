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

  it("image-quality flags demote a passing brand row to manual-review with the 'spot-check' action (the value matched, so 'request better image' would contradict)", async () => {
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
    // matchValidated=true (ladder=pass) → softer spot-check copy.
    expect(brand?.suggestedAction).toMatch(/spot-check/i);
    expect(brand?.suggestedAction).toMatch(/value matches/i);
    // Displayed confidence reflects the deterministic match, not LLM self-doubt.
    expect(brand?.confidence).toBeGreaterThanOrEqual(0.95);
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

describe("runVerificationPipeline — gray-band judge wiring (slice 0009)", () => {
  it("invokes callJudge for gray-band brand cases and routes 'equivalent' to likely-match", async () => {
    const e = passingExtraction();
    // Brand with a different terminal noun pluralisation puts the
    // token_set_ratio firmly in the [0.78, 0.92) gray band.
    e.brand = {
      value: "Old Tom Distilleries",
      evidenceQuote: "Old Tom Distilleries",
      confidence: 0.9,
    };

    let invocations = 0;
    const callJudge = async () => {
      invocations += 1;
      return {
        verdict: "equivalent" as const,
        reasoning: "Same brand with a different terminal pluralisation.",
      };
    };

    const result = await runVerificationPipeline({
      extracted: e,
      expected: EXPECTED,
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
      callJudge,
    });
    const brand = result.fieldResults.find((f) => f.field === "brand");
    expect(invocations).toBeGreaterThanOrEqual(1);
    expect(brand?.status).toBe("likely-match");
  });

  it("routes 'not_equivalent' verdicts back to fail in the gray band", async () => {
    const e = passingExtraction();
    e.brand = {
      value: "Old Tom Distillers Co.",
      evidenceQuote: "Old Tom Distillers Co.",
      confidence: 0.9,
    };
    const callJudge = async () => ({
      verdict: "not_equivalent" as const,
      reasoning: "Different legal entity.",
    });

    const result = await runVerificationPipeline({
      extracted: e,
      expected: EXPECTED,
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
      callJudge,
    });
    const brand = result.fieldResults.find((f) => f.field === "brand");
    expect(brand?.status).toBe("fail");
  });
});

describe("runVerificationPipeline — bottler function-describing phrase (TTB §§ 5.66 / 4.35 / 7.66)", () => {
  it("matches application AND raw OCR has 'Bottled by' near the name → pass (no warning)", async () => {
    const result = await runVerificationPipeline({
      extracted: passingExtraction(),
      expected: EXPECTED,
      words: WORDS,
      rawText:
        "BOTTLED BY OLD TOM DISTILLERY, LLC\nBARDSTOWN, KENTUCKY\n" +
        GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
    });
    const bn = result.fieldResults.find((f) => f.field === "bottlerName");
    expect(bn!.status).toBe("pass");
  });

  it("matches application but raw OCR has no function verb anywhere → warning", async () => {
    const result = await runVerificationPipeline({
      extracted: passingExtraction(),
      expected: EXPECTED,
      words: WORDS,
      // No 'bottled by' / 'distilled by' / etc. anywhere in the OCR.
      rawText:
        "Old Tom Distillery, LLC\nBardstown, Kentucky\n" +
        GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
    });
    const bn = result.fieldResults.find((f) => f.field === "bottlerName");
    expect(bn!.status).toBe("warning");
    expect(bn!.outcomes[0]!.kind).toBe("bottler_function_phrase_missing");
  });
});

describe("runVerificationPipeline — net-contents standards-of-fill warning (TTB §§ 4.72 / 5.203)", () => {
  it("680 mL spirits matches the application but warns on non-standard fill", async () => {
    const e = passingExtraction();
    e.netContents = {
      value: "680 mL",
      evidenceQuote: "680 mL",
      confidence: 0.95,
    };
    const result = await runVerificationPipeline({
      extracted: e,
      expected: { ...EXPECTED, netContents: "680 mL" },
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
    });
    const nc = result.fieldResults.find((f) => f.field === "netContents");
    expect(nc).toBeDefined();
    expect(nc!.status).toBe("warning");
    expect(nc!.outcomes[0]!.kind).toBe("net_contents_non_standard_fill");
  });

  it("750 mL spirits is on the TTB list and passes cleanly (no warning overlay)", async () => {
    const result = await runVerificationPipeline({
      extracted: passingExtraction(),
      expected: EXPECTED, // 750 mL by default
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
    });
    const nc = result.fieldResults.find((f) => f.field === "netContents");
    expect(nc!.status).toBe("pass");
    expect(nc!.outcomes[0]!.kind).toBe("net_contents_pass");
  });

  it("malt beverages always pass standards-of-fill (no fixed list per § 7.70)", async () => {
    const e = passingExtraction();
    e.netContents = {
      value: "680 mL",
      evidenceQuote: "680 mL",
      confidence: 0.95,
    };
    const result = await runVerificationPipeline({
      extracted: e,
      expected: {
        ...EXPECTED,
        netContents: "680 mL",
        beverageType: "malt-beverage",
      },
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
    });
    const nc = result.fieldResults.find((f) => f.field === "netContents");
    expect(nc!.status).toBe("pass");
  });
});

describe("runVerificationPipeline — country-of-origin (auto-derived isImported)", () => {
  it("imported product (Guatemala) — country marking present → pass / likely-match", async () => {
    const e = passingExtraction();
    e.countryOfOrigin = {
      value: "Product of Guatemala",
      evidenceQuote: "Product of Guatemala",
      confidence: 0.95,
    };
    const result = await runVerificationPipeline({
      extracted: e,
      expected: { ...EXPECTED, countryOfOrigin: "Guatemala" },
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
    });
    const country = result.fieldResults.find(
      (f) => f.field === "countryOfOrigin",
    );
    expect(country).toBeDefined();
    expect(["pass", "likely-match"]).toContain(country!.status);
  });

  it("imported product (Guatemala) — missing country marking on label → 'missing' (rule auto-resolved to required, not optional)", async () => {
    const e = passingExtraction();
    e.countryOfOrigin = { value: null, evidenceQuote: null, confidence: 0.6 };
    const result = await runVerificationPipeline({
      extracted: e,
      expected: { ...EXPECTED, countryOfOrigin: "Guatemala" },
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
    });
    const country = result.fieldResults.find(
      (f) => f.field === "countryOfOrigin",
    );
    expect(country).toBeDefined();
    expect(country!.status).toBe("missing");
  });

  it("domestic product (United States) — missing extraction → 'not-required'", async () => {
    const e = passingExtraction();
    e.countryOfOrigin = { value: null, evidenceQuote: null, confidence: 0.6 };
    const result = await runVerificationPipeline({
      extracted: e,
      expected: { ...EXPECTED, countryOfOrigin: "United States" },
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
    });
    const country = result.fieldResults.find(
      (f) => f.field === "countryOfOrigin",
    );
    expect(country).toBeDefined();
    expect(country!.status).toBe("not-required");
  });
});

describe("runVerificationPipeline — bottler address (TTB §§ 5.66 / 4.35 / 7.66)", () => {
  it("city+state on label passes against full street-address-with-ZIP in the application (Old Tom regression)", async () => {
    const e = passingExtraction();
    // What the synthetic Old Tom label actually prints: city + state,
    // all caps, no ZIP.
    e.bottlerAddress = {
      value: "BARDSTOWN, KENTUCKY",
      evidenceQuote: "BARDSTOWN, KENTUCKY",
      confidence: 0.95,
    };
    const result = await runVerificationPipeline({
      extracted: e,
      // Expected has the full mailing address from COLA — street, city,
      // state-abbreviation, ZIP. § 5.66 says only city+state need to be
      // on the label; the rest is optional.
      expected: {
        ...EXPECTED,
        bottlerAddress: "123 Bourbon Lane, Bardstown, KY 40004",
      },
      words: WORDS,
      rawText: GOV_WARNING_CANONICAL,
      imageDims: { width: 1024, height: 1280 },
    });
    const address = result.fieldResults.find(
      (f) => f.field === "bottlerAddress",
    );
    expect(address).toBeDefined();
    expect(["pass", "likely-match"]).toContain(address!.status);
  });
});
