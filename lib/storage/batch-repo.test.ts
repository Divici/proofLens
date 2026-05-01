/** @vitest-environment jsdom */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createBatch,
  getBatch,
  hydrateBatch,
  listBatches,
  saveBatchWithReviews,
  deleteBatch,
} from "./batch-repo";
import { resetDb } from "./db";
import type { Batch, Review } from "./types";
import type { FieldResult } from "@/lib/verify/types";

const ZERO_BBOX = {
  x0: 0,
  y0: 0,
  x1: 1,
  y1: 1,
  imageWidth: 100,
  imageHeight: 100,
};

function makeReview(id: string, overall: Review["overall"] = "pass"): Review {
  const passField: FieldResult = {
    field: "brand",
    label: "Brand",
    status: "pass",
    value: "B",
    expected: "B",
    confidence: 0.9,
    explanation: "Matches.",
    suggestedAction: "No action.",
    evidenceQuote: "B",
    bbox: ZERO_BBOX,
    outcomes: [],
  };
  return {
    id,
    createdAt: new Date(2026, 3, 1, 10, 0, 0).toISOString(),
    reviewerName: "Tester",
    beverageType: "spirits",
    rulesVersion: "ttb-2026-04-30",
    expectedData: {
      brand: "B",
      classType: "C",
      abv: 40,
      netContents: "750 mL",
      bottlerName: "Br",
      bottlerAddress: "Addr",
      countryOfOrigin: "United States",
      govWarningRequired: true,
      applicationNotes: "",
      beverageType: "distilled-spirits",
    },
    extracted: {
      brand: { value: "B", evidenceQuote: "B", confidence: 0.9 },
      classType: { value: "C", evidenceQuote: "C", confidence: 0.9 },
      alcoholContentText: { value: "40%", evidenceQuote: "40%", confidence: 0.9 },
      abvPercent: { value: 40, evidenceQuote: "40%", confidence: 0.9 },
      proof: { value: 80, evidenceQuote: "80", confidence: 0.9 },
      netContents: { value: "750 mL", evidenceQuote: "750 mL", confidence: 0.9 },
      bottlerName: { value: "Br", evidenceQuote: "BR", confidence: 0.9 },
      bottlerAddress: { value: "Addr", evidenceQuote: "ADDR", confidence: 0.9 },
      countryOfOrigin: { value: "USA", evidenceQuote: "USA", confidence: 0.9 },
      governmentWarningText: { value: "warn", evidenceQuote: "GOV", confidence: 0.9 },
      rawText: "RAW",
      imageQualityNotes: [],
      extractionConfidence: 0.9,
    },
    fieldResults: [passField],
    overall,
    imageQualityFlags: [],
    thumbnail: new Blob(["x"], { type: "image/jpeg" }),
    bboxes: {},
    rawText: "RAW",
    decision: undefined,
    processingTimeMs: 1500,
    aiSpend: { primaryUsd: 0.001, fallbackUsd: 0 },
    ocrConfidence: 0.9,
    imageWidth: 100,
    imageHeight: 100,
    brand: "B",
    hasOverrides: false,
  };
}

function makeBatch(id: string, reviewIds: string[]): Batch {
  return {
    id,
    createdAt: new Date(2026, 3, 2, 12, 0, 0).toISOString(),
    reviewerName: "Tester",
    reviewIds,
    status: "complete",
    title: `${reviewIds.length} labels`,
    summary: {
      total: reviewIds.length,
      pass: reviewIds.length,
      fail: 0,
      needsManualReview: 0,
      requestBetterImage: 0,
      passWithWarnings: 0,
      failures: 0,
      qualityIssues: 0,
      avgProcessingTimeMs: 1500,
      totalDurationMs: reviewIds.length * 200,
    },
  };
}

describe("batch-repo", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDb();
  });

  afterEach(() => {
    resetDb();
  });

  it("createBatch + getBatch round-trips", async () => {
    const b = makeBatch("batch-1", []);
    await createBatch(b);
    const out = await getBatch("batch-1");
    expect(out?.id).toBe("batch-1");
  });

  it("listBatches returns newest-first via the createdAt index", async () => {
    const older: Batch = {
      ...makeBatch("older", []),
      createdAt: new Date(2026, 0, 1).toISOString(),
    };
    const newer: Batch = {
      ...makeBatch("newer", []),
      createdAt: new Date(2026, 5, 1).toISOString(),
    };
    await createBatch(older);
    await createBatch(newer);
    const out = await listBatches();
    expect(out.map((b) => b.id)).toEqual(["newer", "older"]);
  });

  it("saveBatchWithReviews writes batch + reviews transactionally", async () => {
    const reviews = [makeReview("r1"), makeReview("r2"), makeReview("r3")];
    const batch = makeBatch("batch-tx", ["r1", "r2", "r3"]);
    await saveBatchWithReviews(batch, reviews);

    const persisted = await getBatch("batch-tx");
    expect(persisted?.id).toBe("batch-tx");
    expect(persisted?.reviewIds).toEqual(["r1", "r2", "r3"]);

    const hydrated = await hydrateBatch("batch-tx");
    expect(hydrated).not.toBeNull();
    expect(hydrated!.batch.id).toBe("batch-tx");
    expect(hydrated!.reviews).toHaveLength(3);
    expect(hydrated!.reviews.map((r) => r.id).sort()).toEqual([
      "r1",
      "r2",
      "r3",
    ]);
  });

  it("hydrateBatch returns null for an unknown id", async () => {
    const out = await hydrateBatch("does-not-exist");
    expect(out).toBeNull();
  });

  it("hydrateBatch tolerates missing review records (returns the rest)", async () => {
    const reviews = [makeReview("r1"), makeReview("r2")];
    const batch = makeBatch("batch-partial", ["r1", "r2", "r3"]);
    await saveBatchWithReviews(batch, reviews);

    const hydrated = await hydrateBatch("batch-partial");
    expect(hydrated).not.toBeNull();
    expect(hydrated!.reviews.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });

  it("deleteBatch removes the batch but does not cascade reviews", async () => {
    const reviews = [makeReview("r1")];
    const batch = makeBatch("batch-del", ["r1"]);
    await saveBatchWithReviews(batch, reviews);

    await deleteBatch("batch-del");
    expect(await getBatch("batch-del")).toBeNull();
    // reviews remain — they may still be reopened from the History page.
    const hydrated = await hydrateBatch("batch-del");
    expect(hydrated).toBeNull();
  });
});
