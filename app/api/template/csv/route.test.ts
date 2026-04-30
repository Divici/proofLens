/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { CSV_TEMPLATE_HEADERS, parseExpectedDataCsv } from "@/lib/batch/csv";

describe("/api/template/csv", () => {
  it("responds with text/csv content type", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/i);
  });

  it("includes a Content-Disposition attachment filename", async () => {
    const res = await GET();
    expect(res.headers.get("content-disposition")).toMatch(
      /attachment;\s*filename="?prooflens-batch-template\.csv"?/i,
    );
  });

  it("body starts with the documented header order", async () => {
    const res = await GET();
    const text = await res.text();
    const firstLine = text.split(/\r?\n/)[0];
    expect(firstLine).toBe(CSV_TEMPLATE_HEADERS.join(","));
  });

  it("body parses cleanly through parseExpectedDataCsv", async () => {
    const res = await GET();
    const text = await res.text();
    const parsed = parseExpectedDataCsv(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.length).toBeGreaterThan(0);
  });
});
