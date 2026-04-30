import { describe, expect, it, vi } from "vitest";
import { runLadder, normaliseForLadder } from "./ladder";

describe("normaliseForLadder", () => {
  it("strips case, punctuation, and applies NFKC", () => {
    expect(normaliseForLadder("Stone's Throw, LLC")).toBe("stones throw llc");
  });

  it("handles smart quotes via NFKC + fold", () => {
    expect(normaliseForLadder("Stone’s Throw")).toBe("stones throw");
  });

  it("collapses repeated whitespace", () => {
    expect(normaliseForLadder("Old   Tom    Distillery")).toBe(
      "old tom distillery",
    );
  });
});

describe("runLadder — case-strip → punct-strip → NFKC → fuzzball.token_set_ratio", () => {
  const fakeJudge = vi.fn();

  it("returns Pass at exact equality (sim = 1.00)", async () => {
    const result = await runLadder({
      extracted: "Stone's Throw",
      expected: "Stone's Throw",
      callJudge: fakeJudge,
    });
    expect(result.kind).toBe("pass");
    expect(result.similarity).toBe(1);
  });

  it("returns Likely Match for case-only differences (sim ≥ 0.92)", async () => {
    const result = await runLadder({
      extracted: "STONE'S THROW",
      expected: "Stone's Throw",
      callJudge: fakeJudge,
    });
    expect(result.kind).toBe("likely-match");
    expect(result.similarity).toBeGreaterThanOrEqual(0.92);
  });

  it("returns Fail for clearly different strings (sim < 0.78)", async () => {
    const result = await runLadder({
      extracted: "Stone Mountain",
      expected: "Stone's Throw",
      callJudge: fakeJudge,
    });
    expect(result.kind).toBe("fail");
    expect(result.similarity).toBeLessThan(0.78);
    expect(fakeJudge).not.toHaveBeenCalled();
  });

  it("invokes the judge in the gray band (0.78 ≤ sim < 0.92) and merges its verdict", async () => {
    const judge = vi
      .fn()
      .mockResolvedValue({ verdict: "equivalent", reasoning: "case + punct" });
    const result = await runLadder({
      extracted: "Stones Drow", // ocr typo on a one-token brand
      expected: "Stones Throw",
      callJudge: judge,
      fieldName: "brand",
    });
    expect(judge).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("likely-match");
    expect(result.judgeVerdict).toBe("equivalent");
  });

  it("downgrades a gray-band match to Fail when judge says not_equivalent", async () => {
    const judge = vi
      .fn()
      .mockResolvedValue({ verdict: "not_equivalent", reasoning: "different" });
    const result = await runLadder({
      extracted: "Stones Drow",
      expected: "Stones Throw",
      callJudge: judge,
    });
    expect(result.kind).toBe("fail");
    expect(result.judgeVerdict).toBe("not_equivalent");
  });

  it("routes uncertain judge verdict to manual-review", async () => {
    const judge = vi
      .fn()
      .mockResolvedValue({ verdict: "uncertain", reasoning: "ambiguous" });
    const result = await runLadder({
      extracted: "Stones Drow",
      expected: "Stones Throw",
      callJudge: judge,
    });
    expect(result.kind).toBe("manual-review");
    expect(result.judgeVerdict).toBe("uncertain");
  });

  it("falls back to manual-review when callJudge is omitted in the gray band", async () => {
    const result = await runLadder({
      extracted: "Stones Drow",
      expected: "Stones Throw",
    });
    expect(result.kind).toBe("manual-review");
    expect(result.judgeVerdict).toBeUndefined();
  });

  it("returns missing when extracted is null", async () => {
    const result = await runLadder({
      extracted: null,
      expected: "Old Tom Distillery",
    });
    expect(result.kind).toBe("missing");
  });

  it("treats whitespace and punctuation noise as Likely Match", async () => {
    const result = await runLadder({
      extracted: "Old Tom  Distillery,  LLC",
      expected: "Old Tom Distillery, LLC",
    });
    expect(result.kind).toBe("likely-match");
  });
});
