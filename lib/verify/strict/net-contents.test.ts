import { describe, expect, it } from "vitest";
import { netContentsMatch, parseVolume } from "./net-contents";

describe("parseVolume", () => {
  it.each([
    ["750 mL", 750],
    ["750ml", 750],
    ["750 ML", 750],
    ["0.75 L", 750],
    ["1 L", 1000],
    ["1.75 L", 1750],
    ["25.36 fl oz", 750.0],
    ["25.4 fl. oz.", 751.17],
    ["375 mL", 375],
  ])("parses %s as ~%i mL", (input, expectedMl) => {
    const parsed = parseVolume(input);
    expect(parsed).not.toBeNull();
    expect(parsed?.canonicalMl).toBeCloseTo(expectedMl, 1);
  });

  it("returns null for unrecognised input", () => {
    expect(parseVolume("yes please")).toBeNull();
  });
});

describe("netContentsMatch", () => {
  it("passes 750 mL ≡ 750ml ≡ 0.75 L", () => {
    expect(
      netContentsMatch({ extracted: "750 mL", expected: "750 mL" }).status,
    ).toBe("pass");
    expect(
      netContentsMatch({ extracted: "750ml", expected: "750 mL" }).status,
    ).toBe("pass");
    expect(
      netContentsMatch({ extracted: "0.75 L", expected: "750 mL" }).status,
    ).toBe("pass");
  });

  it("passes 25.36 fl oz ≡ 750 mL within 0.1% tolerance", () => {
    const result = netContentsMatch({
      extracted: "25.36 fl oz",
      expected: "750 mL",
    });
    expect(result.status).toBe("pass");
  });

  it("fails when volumes differ beyond 0.1% tolerance", () => {
    const result = netContentsMatch({
      extracted: "700 mL",
      expected: "750 mL",
    });
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("volume_mismatch");
  });

  it("fails when extracted volume is unparseable", () => {
    const result = netContentsMatch({
      extracted: "n/a",
      expected: "750 mL",
    });
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("unparseable");
  });

  it("fails when expected volume is unparseable", () => {
    const result = netContentsMatch({
      extracted: "750 mL",
      expected: "??",
    });
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("unparseable");
  });

  it("preserves the canonical mL amount in the outcome", () => {
    const result = netContentsMatch({
      extracted: "0.75 L",
      expected: "750 mL",
    });
    expect(result.foundMl).toBeCloseTo(750, 0);
    expect(result.expectedMl).toBeCloseTo(750, 0);
  });
});
