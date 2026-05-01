import { describe, expect, it } from "vitest";
import { serializeBatchJson } from "./batch";
import {
  makeReviewFixture,
  makeBatchFixture,
} from "@/test/fixtures/review";

describe("serializeBatchJson", () => {
  it("returns a JSON envelope with batch and reviews", () => {
    const reviews = [
      makeReviewFixture({ id: "a" }),
      makeReviewFixture({ id: "b" }),
    ];
    const batch = makeBatchFixture(reviews);
    const json = serializeBatchJson(batch, reviews);
    const parsed = JSON.parse(json);
    expect(parsed.batch.id).toBe("batch-fixture-id");
    expect(parsed.reviews).toHaveLength(2);
    expect(parsed.reviews[0].id).toBe("a");
  });

  it("includes exportedAt + schemaVersion at the top level", () => {
    const reviews = [makeReviewFixture()];
    const batch = makeBatchFixture(reviews);
    const json = serializeBatchJson(batch, reviews, {
      now: () => new Date("2026-04-29T15:00:00Z"),
    });
    const parsed = JSON.parse(json);
    expect(parsed.exportedAt).toBe("2026-04-29T15:00:00.000Z");
    expect(parsed.schemaVersion).toBeDefined();
  });

  it("emits keys alphabetically at every level", () => {
    const reviews = [makeReviewFixture()];
    const batch = makeBatchFixture(reviews);
    const parsed = JSON.parse(serializeBatchJson(batch, reviews));
    const top = Object.keys(parsed);
    expect(top).toEqual([...top].sort());
    const batchKeys = Object.keys(parsed.batch);
    expect(batchKeys).toEqual([...batchKeys].sort());
    const reviewKeys = Object.keys(parsed.reviews[0]);
    expect(reviewKeys).toEqual([...reviewKeys].sort());
  });

  it("each review carries thumbnailBase64 + thumbnailMimeType (and drops the Blob field)", () => {
    const reviews = [makeReviewFixture()];
    const batch = makeBatchFixture(reviews);
    const parsed = JSON.parse(serializeBatchJson(batch, reviews));
    expect(parsed.reviews[0].thumbnailMimeType).toBe("image/jpeg");
    expect(parsed.reviews[0].thumbnail).toBeUndefined();
    expect(typeof parsed.reviews[0].thumbnailBase64).toBe("string");
  });

  it("two serialisations with the same now() produce identical output", () => {
    const reviews = [makeReviewFixture()];
    const batch = makeBatchFixture(reviews);
    const a = serializeBatchJson(batch, reviews, {
      now: () => new Date("2026-04-29T15:00:00Z"),
    });
    const b = serializeBatchJson(batch, reviews, {
      now: () => new Date("2026-04-29T15:00:00Z"),
    });
    expect(a).toBe(b);
  });

  it("handles an empty review list", () => {
    const batch = makeBatchFixture([]);
    const parsed = JSON.parse(serializeBatchJson(batch, []));
    expect(parsed.reviews).toEqual([]);
  });
});
