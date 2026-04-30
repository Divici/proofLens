import { describe, expect, it } from "vitest";
import {
  CSV_TEMPLATE_HEADERS,
  CSV_TEMPLATE_TEXT,
  parseExpectedDataCsv,
} from "./csv";

const VALID_HEADER = CSV_TEMPLATE_HEADERS.join(",");

const validRow = (filename: string, brand = "Sample"): string =>
  [
    filename,
    brand, // brand
    "Sample Class", // classType
    "40", // abv
    "750 mL", // netContents
    "Sample Bottler", // bottlerName
    "Somewhere US", // bottlerAddress (no comma → simpler test fixture)
    "United States", // countryOfOrigin
    "true", // govWarningRequired
    "", // applicationNotes
    "distilled-spirits", // beverageType
  ].join(",");

describe("parseExpectedDataCsv", () => {
  it("parses a valid row from the template into an ExpectedRow", () => {
    const csv = `${VALID_HEADER}\n${validRow("a.jpg", "Old Tom")}`;
    const result = parseExpectedDataCsv(csv);

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      filename: "a.jpg",
      expected: {
        brand: "Old Tom",
        classType: "Sample Class",
        abv: 40,
        netContents: "750 mL",
        bottlerName: "Sample Bottler",
        bottlerAddress: "Somewhere US",
        countryOfOrigin: "United States",
        govWarningRequired: true,
        applicationNotes: "",
        beverageType: "distilled-spirits",
      },
    });
  });

  it("emits errors with line numbers for malformed rows", () => {
    const malformed = ["bad.jpg", "Brand", "Class", "not-a-number", "750 mL", "B", "Addr", "United States", "true", "", "wine"].join(",");
    const csv = `${VALID_HEADER}\n${malformed}`;
    const result = parseExpectedDataCsv(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/line 2/i);
    expect(result.errors[0]).toMatch(/abv/i);
  });

  it("rejects when required headers are missing", () => {
    const csv = "filename,brand\nfoo.jpg,Foo";
    const result = parseExpectedDataCsv(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors.some((e) => /header/i.test(e))).toBe(true);
  });

  it("rejects empty input with a clear message", () => {
    const result = parseExpectedDataCsv("");
    expect(result.rows).toHaveLength(0);
    expect(result.errors.some((e) => /empty/i.test(e))).toBe(true);
  });

  it("accepts case-insensitive boolean strings (TRUE/false/yes/no)", () => {
    const csv = `${VALID_HEADER}\n${validRow("a.jpg")
      .replace(/,true,/, ",YES,")}`;
    const result = parseExpectedDataCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.expected.govWarningRequired).toBe(true);
  });

  it("rejects unknown beverageType values", () => {
    const bad = validRow("a.jpg").replace("distilled-spirits", "lager");
    const csv = `${VALID_HEADER}\n${bad}`;
    const result = parseExpectedDataCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]).toMatch(/beveragetype/i);
  });

  it("aggregates multiple rows + reports errors for the bad ones only", () => {
    const csv = [
      VALID_HEADER,
      validRow("a.jpg", "A"),
      validRow("b.jpg", "B").replace("40", "abv-bad"),
      validRow("c.jpg", "C"),
    ].join("\n");
    const result = parseExpectedDataCsv(csv);

    expect(result.rows.map((r) => r.expected.brand)).toEqual(["A", "C"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/line 3/i);
  });
});

describe("CSV_TEMPLATE_TEXT", () => {
  it("starts with the documented header order", () => {
    expect(CSV_TEMPLATE_TEXT.split("\n")[0]).toBe(VALID_HEADER);
  });

  it("round-trips through parseExpectedDataCsv with no errors", () => {
    const result = parseExpectedDataCsv(CSV_TEMPLATE_TEXT);
    expect(result.errors).toEqual([]);
    expect(result.rows.length).toBeGreaterThan(0);
  });
});
