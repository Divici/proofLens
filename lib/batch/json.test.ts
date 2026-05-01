import { describe, expect, it } from "vitest";
import { parseExpectedDataJson } from "./json";

const validExpected = {
  brand: "Old Tom",
  classType: "Bourbon",
  abv: 45,
  netContents: "750 mL",
  bottlerName: "Old Tom Distillery",
  bottlerAddress: "Bardstown, KY",
  countryOfOrigin: "United States",
  govWarningRequired: true,
  applicationNotes: "",
  beverageType: "distilled-spirits" as const,
};

describe("parseExpectedDataJson", () => {
  it("parses an array of valid pair objects", () => {
    const text = JSON.stringify([
      { filename: "a.jpg", expected: validExpected },
      { filename: "b.jpg", expected: { ...validExpected, brand: "B" } },
    ]);
    const result = parseExpectedDataJson(text);

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.expected.brand).toBe("Old Tom");
    expect(result.rows[1]?.expected.brand).toBe("B");
  });

  it("rejects non-array roots", () => {
    const result = parseExpectedDataJson(
      JSON.stringify({ filename: "a.jpg", expected: validExpected }),
    );
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toMatch(/array/i);
  });

  it("rejects malformed JSON with a clear message", () => {
    const result = parseExpectedDataJson("{not-json");
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toMatch(/parse|json/i);
  });

  it("reports schema violations with row index + field path", () => {
    const text = JSON.stringify([
      {
        filename: "a.jpg",
        expected: { ...validExpected, abv: "forty" },
      },
    ]);
    const result = parseExpectedDataJson(text);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]).toMatch(/row 1/i);
    expect(result.errors[0]).toMatch(/abv/i);
  });

  it("requires `filename` to be a non-empty string", () => {
    const text = JSON.stringify([{ filename: "", expected: validExpected }]);
    const result = parseExpectedDataJson(text);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]).toMatch(/filename/i);
  });

  it("aggregates partial successes — good rows kept, bad rows reported", () => {
    const text = JSON.stringify([
      { filename: "a.jpg", expected: validExpected },
      { filename: "b.jpg", expected: { ...validExpected, abv: -2 } },
      { filename: "c.jpg", expected: { ...validExpected, brand: "C" } },
    ]);
    const result = parseExpectedDataJson(text);
    expect(result.rows.map((r) => r.filename)).toEqual(["a.jpg", "c.jpg"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/row 2/i);
  });

  it("rejects rows that aren't objects", () => {
    const text = JSON.stringify([42, null, "string"]);
    const result = parseExpectedDataJson(text);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(3);
  });
});
