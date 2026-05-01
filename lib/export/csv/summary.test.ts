import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { renderBatchSummaryCsv, SUMMARY_HEADERS } from "./summary";
import { makeReviewFixture, makeBatchFixture } from "@/test/fixtures/review";

describe("renderBatchSummaryCsv", () => {
  it("renders one row per review with the documented header order", () => {
    const reviews = [
      makeReviewFixture({ id: "a", brand: "Brand A" }),
      makeReviewFixture({ id: "b", brand: "Brand B" }),
      makeReviewFixture({ id: "c", brand: "Brand C" }),
    ];
    const batch = makeBatchFixture(reviews);
    const csv = renderBatchSummaryCsv(batch, reviews);
    const parsed = Papa.parse<string[]>(csv.trim(), { header: false });
    const rows = parsed.data as string[][];
    expect(rows[0]).toEqual([...SUMMARY_HEADERS]);
    expect(rows.length).toBe(reviews.length + 1);
  });

  it("uses Title Case headers (slice 0009) and exposes the same per-row values", () => {
    const reviews = [makeReviewFixture()];
    const batch = makeBatchFixture(reviews);
    const csv = renderBatchSummaryCsv(batch, reviews);
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    const row = parsed.data[0]!;
    expect(row["ID"]).toBe("review-fixture-id");
    expect(row["Brand"]).toBe("Old Tom Distillery");
    expect(row["Beverage"]).toBe("spirits");
    expect(row["Overall status"]).toBe("fail");
    expect(row["Reviewer"]).toBe("Jane Doe");
    expect(row["Has overrides"]).toBe("false");
    expect(row["Processing time (ms)"]).toBe("1234");
    expect(row["Completed at"]).toBe("2026-04-29T12:00:00.000Z");
  });

  it("filename column uses the review brand slug when no original filename is recorded", () => {
    const reviews = [makeReviewFixture({ id: "abc" })];
    const batch = makeBatchFixture(reviews);
    const csv = renderBatchSummaryCsv(batch, reviews);
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    const row = parsed.data[0]!;
    // We don't persist the original filename in the IDB schema (per
    // PRESEARCH §8.1), so we synthesize one from id + brand.
    expect(row["Filename"]).toMatch(/old-tom-distillery/);
  });

  it("renders an empty CSV (header only) when given no reviews", () => {
    const csv = renderBatchSummaryCsv(makeBatchFixture([]), []);
    const lines = csv.trim().split(/\r?\n/);
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe(SUMMARY_HEADERS.join(","));
  });

  it("escapes embedded commas / quotes / newlines in brand and reviewer", () => {
    const reviews = [
      makeReviewFixture({
        id: "x",
        brand: 'Brand, Co. "Special"',
        reviewerName: "Jane\nDoe",
      }),
    ];
    const batch = makeBatchFixture(reviews);
    const csv = renderBatchSummaryCsv(batch, reviews);
    expect(csv).toContain('"Brand, Co. ""Special"""');
    // Re-parsing yields the original values.
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    expect(parsed.data[0]!["Brand"]).toBe('Brand, Co. "Special"');
  });
});
