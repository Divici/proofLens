import { describe, expect, it } from "vitest";
import {
  overallMatches,
  quantile,
  statusMatches,
  wordsFromText,
} from "./helpers";

describe("statusMatches", () => {
  it("returns true for an exact literal match", () => {
    expect(statusMatches("pass", "pass")).toBe(true);
  });

  it("returns false for a literal mismatch", () => {
    expect(statusMatches("pass", "fail")).toBe(false);
  });

  it("returns true when actual is in a oneOf union", () => {
    expect(
      statusMatches("manual-review", { oneOf: ["likely-match", "manual-review"] }),
    ).toBe(true);
  });

  it("returns false when actual is not in a oneOf union", () => {
    expect(
      statusMatches("fail", { oneOf: ["likely-match", "manual-review"] }),
    ).toBe(false);
  });

  it("treats an empty oneOf as never matching", () => {
    expect(statusMatches("pass", { oneOf: [] })).toBe(false);
  });
});

describe("overallMatches", () => {
  it("returns true for an exact literal overall match", () => {
    expect(overallMatches("pass-with-warnings", "pass-with-warnings")).toBe(true);
  });

  it("returns false for a literal mismatch", () => {
    expect(overallMatches("pass", "fail")).toBe(false);
  });

  it("returns true when actual is in a oneOf union", () => {
    expect(
      overallMatches("pass-with-warnings", {
        oneOf: ["pass-with-warnings", "needs-manual-review"],
      }),
    ).toBe(true);
  });

  it("returns false when actual is outside the union", () => {
    expect(
      overallMatches("fail", {
        oneOf: ["pass-with-warnings", "needs-manual-review"],
      }),
    ).toBe(false);
  });
});

describe("wordsFromText", () => {
  it("returns one entry per token, splitting on whitespace", () => {
    const words = wordsFromText("hello world");
    expect(words).toHaveLength(2);
    expect(words[0]?.text).toBe("hello");
    expect(words[1]?.text).toBe("world");
  });

  it("ignores empty tokens from multiple spaces", () => {
    const words = wordsFromText("   foo   bar   ");
    expect(words.map((w) => w.text)).toEqual(["foo", "bar"]);
  });

  it("returns empty array for empty input", () => {
    expect(wordsFromText("")).toEqual([]);
    expect(wordsFromText("   ")).toEqual([]);
  });

  it("emits monotonically increasing x coordinates", () => {
    const words = wordsFromText("a b c d");
    for (let i = 1; i < words.length; i++) {
      expect(words[i]!.bbox.x0).toBeGreaterThan(words[i - 1]!.bbox.x0);
    }
  });

  it("gives every token a non-degenerate bbox", () => {
    const words = wordsFromText("Stone's Throw Brewing Co.");
    for (const w of words) {
      expect(w.bbox.x1).toBeGreaterThan(w.bbox.x0);
      expect(w.bbox.y1).toBeGreaterThan(w.bbox.y0);
    }
  });

  it("assigns a high stub confidence so AI_CONFIDENCE_MID gates don't trigger", () => {
    // The status-engine demotes any field below 0.6 confidence to
    // low-confidence; the runner-stub words must stay above that floor.
    const words = wordsFromText("hello");
    expect(words[0]?.confidence).toBeGreaterThanOrEqual(0.6);
  });
});

describe("quantile", () => {
  it("returns 0 for an empty array", () => {
    expect(quantile([], 0.5)).toBe(0);
  });

  it("returns the only value for a single-element array", () => {
    expect(quantile([42], 0.5)).toBe(42);
    expect(quantile([42], 0.95)).toBe(42);
  });

  it("returns the midpoint for an odd-length array at q=0.5", () => {
    expect(quantile([1, 2, 3], 0.5)).toBe(2);
  });

  it("interpolates linearly between adjacent values for non-aligned q", () => {
    // For [1, 2, 3, 4], p50 sits between 2 and 3 → 2.5
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it("returns the maximum for q=1", () => {
    expect(quantile([10, 20, 30, 40, 50], 1)).toBe(50);
  });

  it("returns the minimum for q=0", () => {
    expect(quantile([10, 20, 30, 40, 50], 0)).toBe(10);
  });

  it("p95 of a 20-element latency array picks an interpolated value near max", () => {
    const values = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
    // p95 over [100..2000] in 100 steps → element 19 (1.0-indexed 20) at
    // pos = 19 * 0.95 = 18.05, between 1900 and 2000.
    const p95 = quantile(values, 0.95);
    expect(p95).toBeGreaterThan(1900);
    expect(p95).toBeLessThanOrEqual(2000);
  });

  it("does not mutate the input array", () => {
    const xs = [3, 1, 2];
    quantile(xs, 0.5);
    expect(xs).toEqual([3, 1, 2]);
  });
});
