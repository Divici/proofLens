import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { resetDb } from "./db";
import {
  countReviews,
  createReview,
  deleteReview,
  getReview,
  listReviews,
  searchReviews,
  updateReview,
} from "./review-repo";
import type { Review } from "./types";
import { CURRENT_RULES_VERSION } from "./types";
import type { FieldResult } from "@/lib/verify/types";
import type {
  ApplicationData,
  ExtractedLabelData,
} from "@/lib/ai/schema";

function makeExtracted(): ExtractedLabelData {
  const f = (value: string | null) => ({
    value,
    evidenceQuote: value,
    confidence: 0.9,
  });
  return {
    brand: f("Old Tom Distillery"),
    classType: f("Bourbon"),
    alcoholContentText: f("45%"),
    abvPercent: { value: 45, evidenceQuote: "45%", confidence: 0.9 },
    proof: { value: 90, evidenceQuote: "(90 Proof)", confidence: 0.9 },
    netContents: f("750 mL"),
    bottlerName: f("Old Tom Distillery, LLC"),
    bottlerAddress: f("Bardstown, KY"),
    countryOfOrigin: f("United States"),
    governmentWarningText: f("GOVERNMENT WARNING: ..."),
    rawText: "ANYTHING",
    imageQualityNotes: [],
    extractionConfidence: 0.91,
  };
}

function makeExpected(brand = "Old Tom Distillery"): ApplicationData {
  return {
    brand,
    classType: "Kentucky Straight Bourbon Whiskey",
    abv: 45,
    netContents: "750 mL",
    bottlerName: "Old Tom Distillery, LLC",
    bottlerAddress: "123 Bourbon Lane, Bardstown, KY",
    countryOfOrigin: "United States",
    govWarningRequired: true,
    applicationNotes: "TEST",
    beverageType: "distilled-spirits",
  };
}

function makeFieldResult(overrides: Partial<FieldResult> = {}): FieldResult {
  return {
    field: "brand",
    label: "Brand name",
    status: "pass",
    value: "Old Tom Distillery",
    expected: "Old Tom Distillery",
    confidence: 0.95,
    explanation: "Match.",
    suggestedAction: "No action needed.",
    evidenceQuote: "OLD TOM DISTILLERY",
    bbox: null,
    outcomes: [],
    ...overrides,
  };
}

function makeReview(overrides: Partial<Review> = {}): Review {
  const expected = overrides.expectedData ?? makeExpected();
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    reviewerName: "Jane Doe",
    beverageType: "spirits",
    rulesVersion: CURRENT_RULES_VERSION,
    expectedData: expected,
    extracted: makeExtracted(),
    fieldResults: [makeFieldResult()],
    overall: "pass",
    imageQualityFlags: [],
    thumbnail: new Blob(["fake"], { type: "image/jpeg" }),
    bboxes: {},
    rawText: "ANYTHING",
    decision: undefined,
    processingTimeMs: 1234,
    aiSpend: { primaryUsd: 0.0042, fallbackUsd: 0 },
    brand: expected.brand,
    hasOverrides: false,
    ...overrides,
  };
}

describe("review-repo", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDb();
  });
  afterEach(() => {
    resetDb();
  });

  it("creates and reads a review", async () => {
    const r = makeReview();
    await createReview(r);
    const got = await getReview(r.id);
    expect(got).not.toBeNull();
    expect(got!.id).toBe(r.id);
    expect(got!.brand).toBe("Old Tom Distillery");
  });

  it("lists reviews newest-first", async () => {
    const a = makeReview({
      createdAt: new Date("2026-04-28T12:00:00Z").toISOString(),
      brand: "Older",
      expectedData: makeExpected("Older"),
    });
    const b = makeReview({
      createdAt: new Date("2026-04-29T12:00:00Z").toISOString(),
      brand: "Newer",
      expectedData: makeExpected("Newer"),
    });
    await createReview(a);
    await createReview(b);
    const list = await listReviews();
    expect(list.map((r) => r.brand)).toEqual(["Newer", "Older"]);
  });

  it("updates a review with a human override and the hasOverrides flag flips", async () => {
    const r = makeReview();
    await createReview(r);
    const overridden: Review = {
      ...r,
      hasOverrides: true,
      fieldResults: [
        {
          ...r.fieldResults[0]!,
          humanOverride: {
            originalAiStatus: "pass",
            humanStatus: "fail",
            reason: "Brand colour was wrong; reviewer caught it.",
            timestamp: new Date().toISOString(),
            reviewerName: "Jane Doe",
          },
        },
      ],
    };
    await updateReview(overridden);
    const got = await getReview(r.id);
    expect(got!.hasOverrides).toBe(true);
    expect(got!.fieldResults[0]!.humanOverride?.humanStatus).toBe("fail");
  });

  it("deletes a review", async () => {
    const r = makeReview();
    await createReview(r);
    await deleteReview(r.id);
    expect(await getReview(r.id)).toBeNull();
  });

  it("searches by brand (case-insensitive substring)", async () => {
    await createReview(
      makeReview({ brand: "Old Tom Distillery", expectedData: makeExpected("Old Tom Distillery") }),
    );
    await createReview(
      makeReview({ brand: "Lakeside Gin", expectedData: makeExpected("Lakeside Gin") }),
    );
    const hits = await searchReviews({ search: "lakeside" });
    expect(hits.length).toBe(1);
    expect(hits[0]!.brand).toBe("Lakeside Gin");
  });

  it("searches by reviewer name", async () => {
    await createReview(makeReview({ reviewerName: "Jane Doe" }));
    await createReview(makeReview({ reviewerName: "John Smith" }));
    const hits = await searchReviews({ search: "smith" });
    expect(hits.length).toBe(1);
    expect(hits[0]!.reviewerName).toBe("John Smith");
  });

  it("filters by overall status", async () => {
    await createReview(makeReview({ overall: "pass" }));
    await createReview(makeReview({ overall: "fail" }));
    const hits = await searchReviews({ overall: "fail" });
    expect(hits.length).toBe(1);
    expect(hits[0]!.overall).toBe("fail");
  });

  it("filters by beverage type", async () => {
    await createReview(makeReview({ beverageType: "spirits" }));
    await createReview(makeReview({ beverageType: "wine" }));
    const hits = await searchReviews({ beverageType: "wine" });
    expect(hits.length).toBe(1);
    expect(hits[0]!.beverageType).toBe("wine");
  });

  it("filters by hasOverrides", async () => {
    await createReview(makeReview({ hasOverrides: false }));
    await createReview(makeReview({ hasOverrides: true }));
    const hits = await searchReviews({ hasOverrides: true });
    expect(hits.length).toBe(1);
    expect(hits[0]!.hasOverrides).toBe(true);
  });

  it("counts reviews", async () => {
    expect(await countReviews()).toBe(0);
    await createReview(makeReview());
    await createReview(makeReview());
    expect(await countReviews()).toBe(2);
  });
});
