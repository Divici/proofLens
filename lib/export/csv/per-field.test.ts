import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { renderPerFieldCsv, PER_FIELD_HEADERS } from "./per-field";
import {
  makeReviewFixture,
  makeFieldResults,
} from "@/test/fixtures/review";

describe("renderPerFieldCsv", () => {
  it("emits one row per (review × field) with the documented header order", () => {
    const r1 = makeReviewFixture({ id: "r1" });
    const r2 = makeReviewFixture({ id: "r2" });
    const csv = renderPerFieldCsv([r1, r2]);
    const parsed = Papa.parse<string[]>(csv.trim(), { header: false });
    const rows = parsed.data as string[][];
    expect(rows[0]).toEqual([...PER_FIELD_HEADERS]);
    // 4 fields per fixture review × 2 reviews = 8 + header
    expect(rows.length).toBe(2 * 4 + 1);
  });

  it("uses Title Case headers (slice 0009) and exposes the same per-row values", () => {
    const review = makeReviewFixture();
    const csv = renderPerFieldCsv([review]);
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    const row = parsed.data[0]!;
    expect(row["Review ID"]).toBe("review-fixture-id");
    expect(row["Field name"]).toBe("brand");
    expect(row["Expected"]).toBe("Old Tom Distillery");
    expect(row["Extracted"]).toBe("Old Tom Distillery");
    expect(row["Status"]).toBe("pass");
    expect(Number(row["Confidence"])).toBeCloseTo(0.95);
    // No override on the fixture's first row.
    expect(row["AI status"]).toBe("");
    expect(row["Human status"]).toBe("");
    expect(row["Override reason"]).toBe("");
  });

  it("populates AI status, Human status, Override reason when humanOverride is set", () => {
    const fields = makeFieldResults();
    fields[0] = {
      ...fields[0]!,
      humanOverride: {
        originalAiStatus: "pass",
        humanStatus: "fail",
        reason: "Brand typo",
        timestamp: "2026-04-29T13:00:00.000Z",
        reviewerName: "Jane Doe",
      },
    };
    const review = makeReviewFixture({ fieldResults: fields });
    const csv = renderPerFieldCsv([review]);
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    const overrideRow = parsed.data.find((r) => r["Field name"] === "brand");
    expect(overrideRow?.["AI status"]).toBe("pass");
    expect(overrideRow?.["Human status"]).toBe("fail");
    expect(overrideRow?.["Override reason"]).toBe("Brand typo");
  });

  it("renders boolean / numeric / null values consistently as strings", () => {
    const fields = makeFieldResults();
    fields[1] = { ...fields[1]!, value: 45, expected: 45 };
    const review = makeReviewFixture({ fieldResults: fields });
    const csv = renderPerFieldCsv([review]);
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    const abv = parsed.data.find((r) => r["Field name"] === "abv");
    expect(abv?.["Expected"]).toBe("45");
    expect(abv?.["Extracted"]).toBe("45");
  });

  it("returns header-only CSV for an empty review list", () => {
    const csv = renderPerFieldCsv([]);
    const lines = csv.trim().split(/\r?\n/);
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe(PER_FIELD_HEADERS.join(","));
  });
});
