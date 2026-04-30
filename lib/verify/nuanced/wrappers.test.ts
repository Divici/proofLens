import { describe, expect, it } from "vitest";
import { brandMatch } from "./brand";
import { classTypeMatch } from "./class-type";
import { bottlerMatch } from "./bottler";
import { countryMatch } from "./country";

describe("brandMatch", () => {
  it("passes byte-equal brands", async () => {
    const r = await brandMatch({
      extracted: "Old Tom Distillery",
      expected: "Old Tom Distillery",
    });
    expect(r.kind).toBe("pass");
  });

  it("returns Likely Match for case-only differences", async () => {
    const r = await brandMatch({
      extracted: "OLD TOM DISTILLERY",
      expected: "Old Tom Distillery",
    });
    expect(r.kind).toBe("likely-match");
  });
});

describe("classTypeMatch", () => {
  it("passes minor capitalization differences as Likely Match", async () => {
    const r = await classTypeMatch({
      extracted: "kentucky straight bourbon whiskey",
      expected: "Kentucky Straight Bourbon Whiskey",
    });
    expect(r.kind).toBe("likely-match");
  });
});

describe("bottlerMatch", () => {
  it("passes when LLC suffix is dropped (token_set_ratio is set-aware)", async () => {
    const r = await bottlerMatch({
      extracted: "Old Tom Distillery",
      expected: "Old Tom Distillery, LLC",
    });
    // token_set_ratio handles missing trailing tokens — should be ≥ 0.92.
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

  it("recognises U.S.A. as United States via the alias table", async () => {
    const r = await countryMatch({
      extracted: "U.S.A.",
      expected: "United States",
    });
    expect(r.kind).toBe("likely-match");
  });

  it("recognises 'Product of U.S.A.' as United States", async () => {
    const r = await countryMatch({
      extracted: "Product of U.S.A.",
      expected: "United States",
    });
    expect(r.kind).toBe("likely-match");
  });

  it("fails on a clear country mismatch", async () => {
    const r = await countryMatch({
      extracted: "Mexico",
      expected: "France",
    });
    expect(r.kind).toBe("fail");
  });
});
