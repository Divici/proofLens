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

  it("has columns review_id, filename, field_name, expected, extracted, status, confidence, ai_status, human_status, override_reason", () => {
    const review = makeReviewFixture();
    const csv = renderPerFieldCsv([review]);
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    const row = parsed.data[0]!;
    expect(row.review_id).toBe("review-fixture-id");
    expect(row.field_name).toBe("brand");
    expect(row.expected).toBe("Old Tom Distillery");
    expect(row.extracted).toBe("Old Tom Distillery");
    expect(row.status).toBe("pass");
    expect(Number(row.confidence)).toBeCloseTo(0.95);
    // No override on the fixture's first row.
    expect(row.ai_status).toBe("");
    expect(row.human_status).toBe("");
    expect(row.override_reason).toBe("");
  });

  it("populates ai_status, human_status, override_reason when humanOverride is set", () => {
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
    const overrideRow = parsed.data.find((r) => r.field_name === "brand");
    expect(overrideRow?.ai_status).toBe("pass");
    expect(overrideRow?.human_status).toBe("fail");
    expect(overrideRow?.override_reason).toBe("Brand typo");
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
    const abv = parsed.data.find((r) => r.field_name === "abv");
    expect(abv?.expected).toBe("45");
    expect(abv?.extracted).toBe("45");
  });

  it("returns header-only CSV for an empty review list", () => {
    const csv = renderPerFieldCsv([]);
    const lines = csv.trim().split(/\r?\n/);
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe(PER_FIELD_HEADERS.join(","));
  });
});
