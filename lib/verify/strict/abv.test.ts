import { describe, expect, it } from "vitest";
import { abvMatch, parseAbvText } from "./abv";

describe("parseAbvText — recognises common ABV / proof formats", () => {
  it.each([
    ["45% Alc./Vol.", { abv: 45, proof: null }],
    ["45% ABV", { abv: 45, proof: null }],
    ["Alcohol 45% by Volume", { abv: 45, proof: null }],
    ["45.0%", { abv: 45, proof: null }],
    ["12.5% alc/vol", { abv: 12.5, proof: null }],
    ["40% alc/vol", { abv: 40, proof: null }],
    ["Alc. 40 percent by vol.", { abv: 40, proof: null }],
    ["40 percent alcohol by volume", { abv: 40, proof: null }],
    ["90 Proof", { abv: null, proof: 90 }],
    ["80 PROOF", { abv: null, proof: 80 }],
  ])("parses %s", (input, expected) => {
    const parsed = parseAbvText(input);
    expect(parsed.abv).toEqual(expected.abv);
    expect(parsed.proof).toEqual(expected.proof);
  });

  it("derives ABV from proof when only proof is present", () => {
    const parsed = parseAbvText("90 Proof");
    expect(parsed.abv).toBe(null);
    expect(parsed.proof).toBe(90);
    // The matcher (not the parser) handles the proof→ABV conversion.
  });
});

describe("abvMatch — spirits tolerance ±0.3 pp", () => {
  it("passes equivalent values within tolerance (45 vs 45)", () => {
    const result = abvMatch({ extracted: "45% Alc./Vol.", expected: 45 });
    expect(result.status).toBe("pass");
    expect(result.delta).toBe(0);
  });

  it("passes within ±0.3 pp tolerance (45.2 vs 45)", () => {
    const result = abvMatch({ extracted: "45.2%", expected: 45 });
    expect(result.status).toBe("pass");
  });

  it("passes at the exact tolerance boundary (45.3 vs 45)", () => {
    const result = abvMatch({ extracted: "45.3%", expected: 45 });
    expect(result.status).toBe("pass");
  });

  it("fails just past tolerance (45.31 vs 45)", () => {
    const result = abvMatch({ extracted: "45.31%", expected: 45 });
    expect(result.status).toBe("fail");
  });

  it("fails on a clear mismatch (40 vs 45)", () => {
    const result = abvMatch({ extracted: "40% alc/vol", expected: 45 });
    expect(result.status).toBe("fail");
    expect(result.delta).toBeCloseTo(5, 5);
  });

  it("treats `%` ≡ `percent`", () => {
    const a = abvMatch({ extracted: "45% alc/vol", expected: 45 });
    const b = abvMatch({
      extracted: "Alcohol 45 percent by Volume",
      expected: 45,
    });
    expect(a.status).toBe("pass");
    expect(b.status).toBe("pass");
  });

  it("treats `45.0%` ≡ `45%`", () => {
    const a = abvMatch({ extracted: "45.0%", expected: 45 });
    expect(a.status).toBe("pass");
  });

  it("converts proof to ABV (90 Proof → 45% ABV)", () => {
    const result = abvMatch({ extracted: "90 Proof", expected: 45 });
    expect(result.status).toBe("pass");
  });

  it("fails when proof and ABV disagree on the same label", () => {
    // 45% ABV labelled with "70 Proof" (should be 90) — internal inconsistency.
    const result = abvMatch({
      extracted: "45% Alc./Vol. (70 Proof)",
      expected: 45,
    });
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("internal_inconsistency");
  });

  it("fails as `missing` when no parseable ABV found", () => {
    const result = abvMatch({ extracted: "n/a", expected: 45 });
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("unparseable");
  });
});
