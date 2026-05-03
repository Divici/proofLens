import { describe, expect, it } from "vitest";
import { bottlerAddressMatch } from "./address";

describe("bottlerAddressMatch", () => {
  it("Old Tom regression — label says 'Bardstown, Kentucky' but application has full street address", async () => {
    const outcome = await bottlerAddressMatch({
      extracted: "Bardstown, Kentucky",
      expected: "123 Bourbon Lane, Bardstown, KY 40004",
    });
    // City + state agree. TTB § 5.66: street, county, ZIP optional.
    expect(outcome.kind === "pass" || outcome.kind === "likely-match").toBe(true);
  });

  it("label and application both render city + state — exact match passes", async () => {
    const outcome = await bottlerAddressMatch({
      extracted: "Bardstown, Kentucky",
      expected: "Bardstown, KY",
    });
    expect(outcome.kind === "pass" || outcome.kind === "likely-match").toBe(true);
  });

  it("Jack Daniels — application has ZIP, label doesn't", async () => {
    const outcome = await bottlerAddressMatch({
      extracted: "Lynchburg, Tennessee",
      expected: "Lynchburg, Tennessee 37352",
    });
    expect(outcome.kind === "pass" || outcome.kind === "likely-match").toBe(true);
  });

  it("real mismatch (different city) still fails", async () => {
    const outcome = await bottlerAddressMatch({
      extracted: "Louisville, Kentucky",
      expected: "Bardstown, KY 40004",
    });
    expect(outcome.kind).toBe("fail");
  });

  it("multi-word state (New York) aliases correctly", async () => {
    const outcome = await bottlerAddressMatch({
      extracted: "Brooklyn, NY",
      expected: "Brooklyn, New York 11201",
    });
    expect(outcome.kind === "pass" || outcome.kind === "likely-match").toBe(true);
  });

  it("territory (Puerto Rico) aliases to PR", async () => {
    const outcome = await bottlerAddressMatch({
      extracted: "San Juan, PR",
      expected: "San Juan, Puerto Rico 00901",
    });
    expect(outcome.kind === "pass" || outcome.kind === "likely-match").toBe(true);
  });

  it("missing extraction is missing, not fail", async () => {
    const outcome = await bottlerAddressMatch({
      extracted: null,
      expected: "Bardstown, KY",
    });
    expect(outcome.kind).toBe("missing");
  });

  it("ZIP digits in expected don't poison the score when extracted has no ZIP", async () => {
    const outcome = await bottlerAddressMatch({
      extracted: "Bardstown, KY",
      expected: "Bardstown, KY 40004",
    });
    expect(outcome.kind === "pass" || outcome.kind === "likely-match").toBe(true);
  });
});
