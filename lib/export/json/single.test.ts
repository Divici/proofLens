import { describe, expect, it } from "vitest";
import { serializeReviewJson } from "./single";
import { makeReviewFixture } from "@/test/fixtures/review";

describe("serializeReviewJson", () => {
  it("returns a string parsable as JSON", () => {
    const json = serializeReviewJson(makeReviewFixture());
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("includes a top-level review object plus an exportedAt timestamp", async () => {
    const review = makeReviewFixture();
    const parsed = JSON.parse(
      serializeReviewJson(review, { now: () => new Date("2026-04-29T13:00:00Z") }),
    );
    expect(parsed).toHaveProperty("review");
    expect(parsed.review.id).toBe("review-fixture-id");
    expect(parsed.exportedAt).toBe("2026-04-29T13:00:00.000Z");
    expect(parsed.schemaVersion).toBeDefined();
  });

  it("encodes the thumbnail Blob as base64 with mime type", async () => {
    const review = makeReviewFixture();
    const parsed = JSON.parse(serializeReviewJson(review));
    expect(parsed.review.thumbnailBase64).toBeDefined();
    expect(typeof parsed.review.thumbnailBase64).toBe("string");
    expect(parsed.review.thumbnailMimeType).toBe("image/jpeg");
    // Thumbnail Blob field itself is removed (Blob can't round-trip JSON).
    expect(parsed.review.thumbnail).toBeUndefined();
  });

  it("emits keys in alphabetical order at the top level for stability", () => {
    const review = makeReviewFixture();
    const json = serializeReviewJson(review);
    const parsed = JSON.parse(json);
    const keys = Object.keys(parsed);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });

  it("emits keys in alphabetical order on the inner review object", () => {
    const json = serializeReviewJson(makeReviewFixture());
    const parsed = JSON.parse(json);
    const keys = Object.keys(parsed.review);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });

  it("two serialisations of the same review produce byte-identical output", () => {
    const review = makeReviewFixture();
    const a = serializeReviewJson(review, {
      now: () => new Date("2026-04-29T13:00:00Z"),
    });
    const b = serializeReviewJson(review, {
      now: () => new Date("2026-04-29T13:00:00Z"),
    });
    expect(a).toBe(b);
  });
});
