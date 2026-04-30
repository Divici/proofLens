// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ApplicationDataSchema,
  ExtractedFieldSchema,
  ExtractedLabelDataSchema,
  BeverageTypeSchema,
} from "./schema";

const VALID_APPLICATION_DATA = {
  brand: "Old Tom Distillery",
  classType: "Kentucky Straight Bourbon Whiskey",
  abv: 45,
  netContents: "750 mL",
  bottlerName: "Old Tom Distillery, LLC",
  bottlerAddress: "123 Bourbon Lane, Bardstown, KY 40004",
  countryOfOrigin: "United States",
  govWarningRequired: true,
  applicationNotes: "TTB-2026-00001",
  beverageType: "distilled-spirits" as const,
};

const VALID_EXTRACTED_FIELD = {
  value: "OLD TOM DISTILLERY",
  evidenceQuote: "OLD TOM DISTILLERY",
  confidence: 0.96,
};

const VALID_EXTRACTED_LABEL_DATA = {
  brand: { ...VALID_EXTRACTED_FIELD },
  classType: {
    value: "Kentucky Straight Bourbon Whiskey",
    evidenceQuote: "KENTUCKY STRAIGHT BOURBON WHISKEY",
    confidence: 0.91,
  },
  alcoholContentText: {
    value: "45% Alc./Vol.",
    evidenceQuote: "45% Alc./Vol. (90 Proof)",
    confidence: 0.93,
  },
  abvPercent: {
    value: 45,
    evidenceQuote: "45% Alc./Vol.",
    confidence: 0.92,
  },
  proof: {
    value: 90,
    evidenceQuote: "(90 Proof)",
    confidence: 0.9,
  },
  netContents: {
    value: "750 mL",
    evidenceQuote: "750 mL",
    confidence: 0.95,
  },
  bottlerName: {
    value: "Old Tom Distillery, LLC",
    evidenceQuote: "BOTTLED BY OLD TOM DISTILLERY, LLC",
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
    value:
      "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON GENERAL...",
    evidenceQuote: "GOVERNMENT WARNING: (1) ACCORDING...",
    confidence: 0.94,
  },
  rawText: null,
  imageQualityNotes: ["Slight glare in the upper-left corner"],
  extractionConfidence: 0.91,
};

describe("BeverageTypeSchema", () => {
  it("accepts every documented beverage type", () => {
    for (const t of [
      "distilled-spirits",
      "wine",
      "malt-beverage",
      "unknown",
    ] as const) {
      expect(BeverageTypeSchema.parse(t)).toBe(t);
    }
  });

  it("rejects values outside the enum", () => {
    expect(() => BeverageTypeSchema.parse("cider")).toThrow();
  });
});

describe("ApplicationDataSchema", () => {
  it("parses a fully populated application record", () => {
    const parsed = ApplicationDataSchema.parse(VALID_APPLICATION_DATA);
    expect(parsed).toEqual(VALID_APPLICATION_DATA);
  });

  it("rejects when required fields are missing", () => {
    const { brand: _brand, ...rest } = VALID_APPLICATION_DATA;
    void _brand;
    expect(() => ApplicationDataSchema.parse(rest)).toThrow();
  });

  it("rejects an ABV outside 0..100", () => {
    expect(() =>
      ApplicationDataSchema.parse({
        ...VALID_APPLICATION_DATA,
        abv: 120,
      }),
    ).toThrow();
  });
});

describe("ExtractedFieldSchema", () => {
  it("accepts a confidence at the boundary 0", () => {
    expect(
      ExtractedFieldSchema.parse({
        value: null,
        evidenceQuote: null,
        confidence: 0,
      }).confidence,
    ).toBe(0);
  });

  it("accepts a confidence at the boundary 1", () => {
    expect(
      ExtractedFieldSchema.parse({ ...VALID_EXTRACTED_FIELD, confidence: 1 })
        .confidence,
    ).toBe(1);
  });

  it("rejects a confidence above 1", () => {
    expect(() =>
      ExtractedFieldSchema.parse({
        ...VALID_EXTRACTED_FIELD,
        confidence: 1.01,
      }),
    ).toThrow();
  });

  it("rejects a negative confidence", () => {
    expect(() =>
      ExtractedFieldSchema.parse({
        ...VALID_EXTRACTED_FIELD,
        confidence: -0.1,
      }),
    ).toThrow();
  });

  it("allows null value with null evidenceQuote when the field is not visible", () => {
    const field = ExtractedFieldSchema.parse({
      value: null,
      evidenceQuote: null,
      confidence: 0.0,
    });
    expect(field.value).toBeNull();
    expect(field.evidenceQuote).toBeNull();
  });
});

describe("ExtractedLabelDataSchema", () => {
  it("parses a valid extraction payload", () => {
    const parsed = ExtractedLabelDataSchema.parse(VALID_EXTRACTED_LABEL_DATA);
    expect(parsed.extractionConfidence).toBe(0.91);
    expect(parsed.brand.value).toBe("OLD TOM DISTILLERY");
  });

  it("rejects an extractionConfidence outside [0,1]", () => {
    expect(() =>
      ExtractedLabelDataSchema.parse({
        ...VALID_EXTRACTED_LABEL_DATA,
        extractionConfidence: 1.5,
      }),
    ).toThrow();
  });

  it("rejects when a required field is missing", () => {
    const { brand: _brand, ...rest } = VALID_EXTRACTED_LABEL_DATA;
    void _brand;
    expect(() => ExtractedLabelDataSchema.parse(rest)).toThrow();
  });
});
