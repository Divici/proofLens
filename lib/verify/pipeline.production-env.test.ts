import { describe, expect, it } from "vitest";
import { runVerificationPipeline } from "./pipeline";
import { GOV_WARNING_CANONICAL } from "./strict/gov-warning-canonical";
import type { ApplicationData, ExtractedLabelData } from "@/lib/ai/schema";
import type { TesseractWord } from "@/lib/ocr/tesseract";

/**
 * Phase 6 — Vercel-flavored regression net (full-review plan).
 *
 * Every test here runs the verification pipeline under the same
 * conditions the production deploy ships with:
 *
 *   - `rawText`  is the LLM's verbatim gov-warning capture only
 *                (~321 chars). NO bottler line, NO brand line, NO
 *                supplemental label text. This mirrors the route's
 *                `effectiveRawText = fallbackRawText` branch when
 *                `process.env.VERCEL` is truthy.
 *   - `words`    is empty — Tesseract is disabled on Vercel
 *                (ADR 0007), so bbox lookups must degrade to null.
 *   - The LLM extraction's `evidenceQuote` carries the verb-bearing
 *                slice that the OCR would have produced locally.
 *
 * These tests run alongside the full-OCR tests in `pipeline.test.ts`.
 * A failure here means a real production user would see the bug —
 * the kind of regression the user was seeing repeatedly before this
 * suite existed (function-phrase false-warns, dead bbox highlighting,
 * gov-warning prefix mismatch on the LLM-fallback rawText).
 *
 * Driving rule: production-or-cut (ADR 0010). If a grader can't
 * make a sound decision under these inputs, either it must be fixed
 * to read a Vercel-available signal, or its overlay must be removed.
 */

const IMAGE_DIMS = { width: 1024, height: 1280 } as const;
const VERCEL_WORDS: ReadonlyArray<TesseractWord> = [];
const VERCEL_RAW_TEXT = GOV_WARNING_CANONICAL;

const EXPECTED_SPIRITS: ApplicationData = {
  brand: "Old Tom Distillery",
  classType: "Kentucky Straight Bourbon Whiskey",
  abv: 45,
  netContents: "750 mL",
  bottlerName: "Old Tom Distillery, LLC",
  bottlerAddress: "Bardstown, KY",
  countryOfOrigin: "United States",
  govWarningRequired: true,
  applicationNotes: "TTB-2026-PROD-SIM",
  beverageType: "distilled-spirits",
};

/**
 * Build an `ExtractedLabelData` payload shaped the way the Vercel
 * deploy synthesizes it: the LLM-only path. `rawText` on the
 * extracted struct is the merged gov-warning (matches what the route
 * actually returns), and the bottlerName.evidenceQuote includes the
 * function-describing verb the way the LLM tends to capture it on
 * full-bottle photos.
 */
function vercelExtractionForOldTom(): ExtractedLabelData {
  return {
    brand: {
      value: "Old Tom Distillery",
      evidenceQuote: "OLD TOM DISTILLERY",
      confidence: 0.96,
    },
    classType: {
      value: "Kentucky Straight Bourbon Whiskey",
      evidenceQuote: "KENTUCKY STRAIGHT BOURBON WHISKEY",
      confidence: 0.92,
    },
    alcoholContentText: {
      value: "45% Alc./Vol.",
      evidenceQuote: "45% Alc./Vol.",
      confidence: 0.93,
    },
    abvPercent: { value: 45, evidenceQuote: "45%", confidence: 0.92 },
    proof: { value: 90, evidenceQuote: "(90 Proof)", confidence: 0.9 },
    netContents: {
      value: "750 mL",
      evidenceQuote: "750 mL",
      confidence: 0.95,
    },
    bottlerName: {
      value: "Old Tom Distillery, LLC",
      // Critical for the Phase-1 function-phrase fix: the verb-bearing
      // slice lives in `evidenceQuote`, not in `rawText`. The scanner
      // merges both sources so this still finds "DISTILLED BY".
      evidenceQuote: "DISTILLED BY OLD TOM DISTILLERY, LLC",
      confidence: 0.88,
    },
    bottlerAddress: {
      value: "Bardstown, KY",
      evidenceQuote: "BARDSTOWN, KENTUCKY",
      confidence: 0.85,
    },
    countryOfOrigin: {
      value: "United States",
      evidenceQuote: "PRODUCT OF U.S.A.",
      confidence: 0.87,
    },
    governmentWarningText: {
      value: GOV_WARNING_CANONICAL,
      evidenceQuote: GOV_WARNING_CANONICAL,
      confidence: 0.94,
    },
    rawText: VERCEL_RAW_TEXT,
    imageQualityNotes: [],
    extractionConfidence: 0.91,
  };
}

describe("Vercel-flavored pipeline — happy path", () => {
  it("happy path passes overall with no false function-phrase warning (rawText is gov-only, verb is in evidenceQuote)", async () => {
    const result = await runVerificationPipeline({
      extracted: vercelExtractionForOldTom(),
      expected: EXPECTED_SPIRITS,
      words: VERCEL_WORDS,
      rawText: VERCEL_RAW_TEXT,
      imageDims: IMAGE_DIMS,
    });

    // "United States" vs the LLM's "PRODUCT OF U.S.A." normalises to a
    // Likely Match via the alias table — a Pass-With-Warnings, not a
    // strict fail.
    expect(["pass", "pass-with-warnings"]).toContain(result.overall);

    const bn = result.fieldResults.find((f) => f.field === "bottlerName");
    // Phase-1 regression — the function-phrase scanner must NOT
    // false-warn just because rawText is sparse.
    expect(bn?.status).not.toBe("warning");
    expect(bn?.outcomes[0]?.kind).not.toBe("bottler_function_phrase_missing");

    // No strict fails on the happy path.
    const fails = result.fieldResults.filter((f) => f.status === "fail");
    expect(fails).toHaveLength(0);
  });

  it("every field row resolves bbox to null when words is empty (graceful degradation, no throw)", async () => {
    const result = await runVerificationPipeline({
      extracted: vercelExtractionForOldTom(),
      expected: EXPECTED_SPIRITS,
      words: VERCEL_WORDS,
      rawText: VERCEL_RAW_TEXT,
      imageDims: IMAGE_DIMS,
    });

    // Every field result should still be produced — no field skipped or
    // crashed — but every bbox should be null because there are no
    // word coordinates to lookup.
    expect(result.fieldResults.length).toBeGreaterThanOrEqual(7);
    for (const f of result.fieldResults) {
      expect(f.bbox).toBeNull();
    }
  });
});

describe("Vercel-flavored pipeline — strict matchers", () => {
  it("gov-warning matcher passes when rawText is exactly the canonical capture", async () => {
    const result = await runVerificationPipeline({
      extracted: vercelExtractionForOldTom(),
      expected: EXPECTED_SPIRITS,
      words: VERCEL_WORDS,
      rawText: VERCEL_RAW_TEXT,
      imageDims: IMAGE_DIMS,
    });
    const gov = result.fieldResults.find(
      (f) => f.field === "governmentWarning",
    );
    expect(gov?.status).toBe("pass");
    expect(gov?.outcomes[0]?.kind).toBe("gov_warning_pass");
  });

  it("gov-warning prefix-capitalization fail still fires when the LLM-only rawText has a lowercased prefix", async () => {
    const e = vercelExtractionForOldTom();
    const lowered = GOV_WARNING_CANONICAL.replace(
      "GOVERNMENT WARNING:",
      "Government Warning:",
    );
    e.governmentWarningText = {
      value: lowered,
      evidenceQuote: lowered,
      confidence: 0.94,
    };
    e.rawText = lowered;

    const result = await runVerificationPipeline({
      extracted: e,
      expected: EXPECTED_SPIRITS,
      words: VERCEL_WORDS,
      rawText: lowered,
      imageDims: IMAGE_DIMS,
    });
    const gov = result.fieldResults.find(
      (f) => f.field === "governmentWarning",
    );
    expect(gov?.status).toBe("fail");
    expect(gov?.outcomes[0]?.kind).toBe("gov_warning_prefix_capitalization");
  });

  it("ABV strict fail fires regardless of rawText sparsity (38% extracted, 45% expected)", async () => {
    const e = vercelExtractionForOldTom();
    e.alcoholContentText = {
      value: "38% Alc./Vol.",
      evidenceQuote: "38% Alc./Vol.",
      confidence: 0.93,
    };
    e.abvPercent = { value: 38, evidenceQuote: "38%", confidence: 0.93 };

    const result = await runVerificationPipeline({
      extracted: e,
      expected: EXPECTED_SPIRITS,
      words: VERCEL_WORDS,
      rawText: VERCEL_RAW_TEXT,
      imageDims: IMAGE_DIMS,
    });
    const abv = result.fieldResults.find((f) => f.field === "abv");
    expect(abv?.status).toBe("fail");
    expect(result.overall).toBe("fail");
  });

  it("net-contents strict pass still resolves under empty word stream", async () => {
    const result = await runVerificationPipeline({
      extracted: vercelExtractionForOldTom(),
      expected: EXPECTED_SPIRITS,
      words: VERCEL_WORDS,
      rawText: VERCEL_RAW_TEXT,
      imageDims: IMAGE_DIMS,
    });
    const nc = result.fieldResults.find((f) => f.field === "netContents");
    expect(nc?.status).toBe("pass");
    expect(nc?.outcomes[0]?.kind).toBe("net_contents_pass");
  });
});

describe("Vercel-flavored pipeline — warning overlays (TTB §§ 4.72 / 5.203 / 5.66)", () => {
  it("standards-of-fill warning fires for non-standard 680 mL spirits even with words=[]", async () => {
    const e = vercelExtractionForOldTom();
    e.netContents = {
      value: "680 mL",
      evidenceQuote: "680 mL",
      confidence: 0.95,
    };

    const result = await runVerificationPipeline({
      extracted: e,
      expected: { ...EXPECTED_SPIRITS, netContents: "680 mL" },
      words: VERCEL_WORDS,
      rawText: VERCEL_RAW_TEXT,
      imageDims: IMAGE_DIMS,
    });
    const nc = result.fieldResults.find((f) => f.field === "netContents");
    expect(nc?.status).toBe("warning");
    expect(nc?.outcomes[0]?.kind).toBe("net_contents_non_standard_fill");
  });

  it("function-phrase warning DOES still fire when the verb is genuinely absent from BOTH rawText and evidenceQuote (no false negative)", async () => {
    const e = vercelExtractionForOldTom();
    // Strip the verb from the evidence quote — emulates a label that
    // truly does not state a function-describing phrase. rawText is
    // already gov-warning-only, so neither source has a verb.
    e.bottlerName = {
      value: "Old Tom Distillery, LLC",
      evidenceQuote: "OLD TOM DISTILLERY, LLC",
      confidence: 0.88,
    };

    const result = await runVerificationPipeline({
      extracted: e,
      expected: EXPECTED_SPIRITS,
      words: VERCEL_WORDS,
      rawText: VERCEL_RAW_TEXT,
      imageDims: IMAGE_DIMS,
    });
    const bn = result.fieldResults.find((f) => f.field === "bottlerName");
    expect(bn?.status).toBe("warning");
    expect(bn?.outcomes[0]?.kind).toBe("bottler_function_phrase_missing");
  });

  it("function-phrase warning is suppressed when evidenceQuote carries the verb (Phase-1 fix, codified at the pipeline level)", async () => {
    // Stone's Throw real-photo case: the brewery's label prints
    // "BREWED AND BOTTLED BY ..." and the LLM puts the whole slice in
    // bottlerName.evidenceQuote. On Vercel, rawText is gov-only — the
    // scanner has to reach into evidenceQuote to find the verb.
    const e = vercelExtractionForOldTom();
    e.bottlerName = {
      value: "Stone's Throw Brewing Co.",
      evidenceQuote: "BREWED AND BOTTLED BY STONE'S THROW BREWING CO.",
      confidence: 0.9,
    };

    const result = await runVerificationPipeline({
      extracted: e,
      expected: { ...EXPECTED_SPIRITS, bottlerName: "Stone's Throw Brewing Co." },
      words: VERCEL_WORDS,
      rawText: VERCEL_RAW_TEXT,
      imageDims: IMAGE_DIMS,
    });
    const bn = result.fieldResults.find((f) => f.field === "bottlerName");
    expect(bn?.status).not.toBe("warning");
    expect(bn?.outcomes[0]?.kind).not.toBe("bottler_function_phrase_missing");
  });
});

describe("Vercel-flavored pipeline — country-of-origin (imported product, sparse rawText)", () => {
  it("imported product (Guatemala) — country marking in evidenceQuote → pass / likely-match", async () => {
    const e = vercelExtractionForOldTom();
    e.countryOfOrigin = {
      value: "Product of Guatemala",
      evidenceQuote: "PRODUCT OF GUATEMALA",
      confidence: 0.95,
    };

    const result = await runVerificationPipeline({
      extracted: e,
      expected: { ...EXPECTED_SPIRITS, countryOfOrigin: "Guatemala" },
      words: VERCEL_WORDS,
      rawText: VERCEL_RAW_TEXT,
      imageDims: IMAGE_DIMS,
    });
    const country = result.fieldResults.find(
      (f) => f.field === "countryOfOrigin",
    );
    expect(["pass", "likely-match"]).toContain(country?.status);
  });

  it("imported product missing country marking still routes to 'missing' (no rawText scaffolding required)", async () => {
    const e = vercelExtractionForOldTom();
    e.countryOfOrigin = { value: null, evidenceQuote: null, confidence: 0.6 };

    const result = await runVerificationPipeline({
      extracted: e,
      expected: { ...EXPECTED_SPIRITS, countryOfOrigin: "Guatemala" },
      words: VERCEL_WORDS,
      rawText: VERCEL_RAW_TEXT,
      imageDims: IMAGE_DIMS,
    });
    const country = result.fieldResults.find(
      (f) => f.field === "countryOfOrigin",
    );
    expect(country?.status).toBe("missing");
  });
});
