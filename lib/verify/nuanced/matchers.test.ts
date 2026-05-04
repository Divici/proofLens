import { describe, expect, it } from "vitest";
import {
  brandMatch,
  classTypeMatch,
  bottlerMatch,
  countryMatch,
} from "./matchers";

describe("brandMatch", () => {
  it("passes byte-equal brands", async () => {
    const r = await brandMatch({
      extracted: "Old Tom Distillery",
      expected: "Old Tom Distillery",
    });
    expect(r.kind).toBe("pass");
  });

  it("returns Pass-Normalised for case-only differences (rung 1)", async () => {
    const r = await brandMatch({
      extracted: "OLD TOM DISTILLERY",
      expected: "Old Tom Distillery",
    });
    expect(r.kind).toBe("pass-normalised");
  });
});

describe("classTypeMatch", () => {
  it("passes minor capitalization differences as Pass-Normalised (rung 1)", async () => {
    const r = await classTypeMatch({
      extracted: "kentucky straight bourbon whiskey",
      expected: "Kentucky Straight Bourbon Whiskey",
    });
    expect(r.kind).toBe("pass-normalised");
  });
});

describe("bottlerMatch", () => {
  it("passes when LLC suffix is dropped (token_set_ratio is set-aware)", async () => {
    const r = await bottlerMatch({
      extracted: "Old Tom Distillery",
      expected: "Old Tom Distillery, LLC",
    });
    expect(["pass", "likely-match"]).toContain(r.kind);
  });
});

describe("countryMatch", () => {
  it("strips 'Product of ' prefix and matches", async () => {
    const r = await countryMatch({
      extracted: "Product of France",
      expected: "France",
    });
    expect(["pass", "likely-match"]).toContain(r.kind);
  });

  it("recognises U.S.A. as United States via the alias table (Pass-Normalised — alias-driven equivalence)", async () => {
    const r = await countryMatch({
      extracted: "U.S.A.",
      expected: "United States",
    });
    expect(r.kind).toBe("pass-normalised");
  });

  it("recognises 'Product of U.S.A.' as United States (Pass-Normalised)", async () => {
    const r = await countryMatch({
      extracted: "Product of U.S.A.",
      expected: "United States",
    });
    expect(r.kind).toBe("pass-normalised");
  });

  it("fails on a clear country mismatch", async () => {
    const r = await countryMatch({
      extracted: "Mexico",
      expected: "France",
    });
    expect(r.kind).toBe("fail");
  });
});
