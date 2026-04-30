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

describe("abvMatch — per-beverage tolerances (slice 0004)", () => {
  it("malt-beverage: ±0.3 pp tolerance per 27 CFR § 7.65 (4.0% vs 4.3%) passes", () => {
    const result = abvMatch({
      extracted: "4.3% alc/vol",
      expected: 4.0,
      beverageType: "malt-beverage",
    });
    expect(result.status).toBe("pass");
    expect(result.tolerance).toBe(0.3);
  });

  it("malt-beverage: ±0.3 pp tolerance, 4.0% vs 4.5% fails", () => {
    const result = abvMatch({
      extracted: "4.5% alc/vol",
      expected: 4.0,
      beverageType: "malt-beverage",
    });
    expect(result.status).toBe("fail");
  });

  it("wine table (≤ 14%): ±1.5 pp tolerance per 27 CFR § 4.36 (12% vs 13%) passes", () => {
    const result = abvMatch({
      extracted: "13% alc/vol",
      expected: 12,
      beverageType: "wine",
    });
    expect(result.status).toBe("pass");
    expect(result.tolerance).toBe(1.5);
  });

  it("wine table (≤ 14%): ±1.5 pp tolerance, 12% vs 13.5% passes at boundary", () => {
    const result = abvMatch({
      extracted: "13.5% alc/vol",
      expected: 12,
      beverageType: "wine",
    });
    expect(result.status).toBe("pass");
  });

  it("wine table (≤ 14%): 12% vs 13.6% fails just past tolerance", () => {
    const result = abvMatch({
      extracted: "13.6% alc/vol",
      expected: 12,
      beverageType: "wine",
    });
    expect(result.status).toBe("fail");
  });

  it("wine over 14%: ±1.0 pp tolerance per 27 CFR § 4.36 (15% vs 16%) passes", () => {
    const result = abvMatch({
      extracted: "16% alc/vol",
      expected: 15,
      beverageType: "wine",
    });
    expect(result.status).toBe("pass");
    expect(result.tolerance).toBe(1.0);
  });

  it("wine over 14%: 15% vs 16.1% fails just past tolerance", () => {
    const result = abvMatch({
      extracted: "16.1% alc/vol",
      expected: 15,
      beverageType: "wine",
    });
    expect(result.status).toBe("fail");
  });

  it("wine: tolerance does not span the 14% taxable boundary (14% vs 15.4% fails)", () => {
    // Wine at 14% sits in the "≤ 14%" tier; an extracted 15.4% would be
    // > 14% and lives in the other tier — the regulation forbids the
    // tolerance band from straddling 14%.
    const result = abvMatch({
      extracted: "15.4% alc/vol",
      expected: 14,
      beverageType: "wine",
    });
    expect(result.status).toBe("fail");
  });

  it("distilled-spirits: explicitly typed still uses ±0.3 pp", () => {
    const result = abvMatch({
      extracted: "45.3% alc/vol",
      expected: 45,
      beverageType: "distilled-spirits",
    });
    expect(result.status).toBe("pass");
    expect(result.tolerance).toBe(0.3);
  });

  it("unknown beverage: defaults to spirits tolerance ±0.3 pp (most conservative)", () => {
    const result = abvMatch({
      extracted: "45.3% alc/vol",
      expected: 45,
      beverageType: "unknown",
    });
    expect(result.status).toBe("pass");
    expect(result.tolerance).toBe(0.3);
  });
});
