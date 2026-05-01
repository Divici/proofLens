import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runVerificationPipeline } from "../lib/verify/pipeline";
import {
  ApplicationDataSchema,
  ExtractedLabelDataSchema,
} from "../lib/ai/schema";
import {
  overallMatches,
  statusMatches,
  wordsFromText,
} from "./helpers";

/**
 * Integration test for the eval runner — drives each on-disk golden case
 * through the deterministic pipeline (the same code path Layer 1 uses) and
 * asserts the published expectations hold.
 *
 * If this test passes but `pnpm eval:deterministic` fails (or vice versa),
 * the runner CLI has drifted from the helper functions — the helpers' unit
 * tests live in `helpers.test.ts`.
 */

const GOLDEN_DIR = join(__dirname, "golden");

interface GoldenCase {
  id: string;
  name: string;
  tags: string[];
  input: { labelImagePath: string; expectedData: unknown };
  mockExtraction: unknown;
  mockOcr: { rawText: string };
  /**
   * When set, the runner skips this case at Layer 2 (live API) because the
   * case's `expectedData` doesn't align with the on-disk fixture image —
   * usually because we want a real bottle photo for that scenario rather
   * than a programmatic placeholder. Layer 1 still runs (it ignores the
   * image entirely).
   */
  skipLayer2?: { reason: string };
  expected: {
    overall: string | { oneOf: string[] };
    fieldExpectations: Array<{
      field: string;
      status: string | { oneOf: string[] };
    }>;
    imageQualityFlags: string[];
    mustReachGovWarningFail?: boolean;
  };
}

function loadGolden(): GoldenCase[] {
  const files = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith(".json")).sort();
  return files.map(
    (f) => JSON.parse(readFileSync(join(GOLDEN_DIR, f), "utf8")) as GoldenCase,
  );
}

describe("eval golden set — case coverage", () => {
  it("contains at least 30 cases (Phase-7 floor)", () => {
    const cases = loadGolden();
    expect(cases.length).toBeGreaterThanOrEqual(30);
  });

  it("covers all required tag families", () => {
    const cases = loadGolden();
    const tagSet = new Set(cases.flatMap((c) => c.tags));
    expect(tagSet.has("happy-path")).toBe(true);
    expect(tagSet.has("strict-fail")).toBe(true);
    expect(tagSet.has("nuanced-match")).toBe(true);
    expect(tagSet.has("image-quality")).toBe(true);
    expect(tagSet.has("beverage-aware")).toBe(true);
    expect(tagSet.has("gov-warning")).toBe(true);
  });

  it("has at least 8 strict-fail gov-warning recall cases", () => {
    const cases = loadGolden();
    const govFail = cases.filter(
      (c) => c.tags.includes("gov-warning") && c.tags.includes("strict-fail"),
    );
    expect(govFail.length).toBeGreaterThanOrEqual(8);
  });

  it("has at least 5 ABV strict cases", () => {
    const cases = loadGolden();
    const abv = cases.filter(
      (c) => c.tags.includes("abv") || c.tags.includes("abv-tolerance"),
    );
    expect(abv.length).toBeGreaterThanOrEqual(5);
  });

  it("has at least 5 nuanced brand cases", () => {
    const cases = loadGolden();
    const brand = cases.filter(
      (c) => c.tags.includes("nuanced-match") && c.tags.includes("brand"),
    );
    expect(brand.length).toBeGreaterThanOrEqual(5);
  });

  it("has at least 4 image-quality cases", () => {
    const cases = loadGolden();
    const iq = cases.filter((c) => c.tags.includes("image-quality"));
    expect(iq.length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 4 beverage-aware cases", () => {
    const cases = loadGolden();
    const bev = cases.filter((c) => c.tags.includes("beverage-aware"));
    expect(bev.length).toBeGreaterThanOrEqual(4);
  });

  it("flags cases that need a real bottle photo with skipLayer2.reason", () => {
    const cases = loadGolden();
    const skipped = cases.filter((c) => c.skipLayer2);
    // We expect at least the four happy-path-other / wine cases, the wine
    // and malt ABV variants, and the beverage-aware edges to be flagged.
    expect(skipped.length).toBeGreaterThanOrEqual(10);
    for (const c of skipped) {
      expect(
        c.skipLayer2?.reason && c.skipLayer2.reason.length > 0,
        `${c.id} ${c.name}: skipLayer2 must carry a non-empty reason`,
      ).toBe(true);
    }
  });

  it("every gov-warning mutation case (005-013) points at its own image", () => {
    const cases = loadGolden();
    // Restrict to the 005-013 mutation series. Demo-scenario cases (032-037)
    // also carry gov-warning/strict-fail tags but are intentionally pinned
    // to specific demo fixtures, so they don't participate in the
    // one-image-per-mutation invariant.
    const mutations = cases.filter(
      (c) => c.id >= "005" && c.id <= "013",
    );
    expect(mutations.length).toBe(9);
    const seenPaths = new Set<string>();
    for (const c of mutations) {
      const p = c.input.labelImagePath;
      // Case 006 (lowercased-prefix) reuses the original
      // 04-gov-warn-lowercase fixture; the other eight mutations must each
      // have a unique mutation-specific image so the live LLM extracts the
      // case's exact mutation from the photo, not some other case's.
      const exempt = c.name.includes("lowercased-prefix");
      if (!exempt) {
        expect(
          seenPaths.has(p),
          `${c.id} ${c.name}: image ${p} reused by another mutation case`,
        ).toBe(false);
      }
      seenPaths.add(p);
    }
  });
});

describe("eval golden set — schema validation", () => {
  it("every case's expectedData parses ApplicationDataSchema", () => {
    for (const c of loadGolden()) {
      const parsed = ApplicationDataSchema.safeParse(c.input.expectedData);
      expect(parsed.success, `${c.id} ${c.name}: ${parsed.success ? "" : parsed.error.message}`).toBe(true);
    }
  });

  it("every case's mockExtraction parses ExtractedLabelDataSchema", () => {
    for (const c of loadGolden()) {
      const parsed = ExtractedLabelDataSchema.safeParse(c.mockExtraction);
      expect(parsed.success, `${c.id} ${c.name}: ${parsed.success ? "" : parsed.error.message}`).toBe(true);
    }
  });
});

describe("eval golden set — Layer 1 pipeline assertions", () => {
  it("every case produces the expected overall + field statuses", async () => {
    const failures: string[] = [];
    for (const c of loadGolden()) {
      const appParsed = ApplicationDataSchema.parse(c.input.expectedData);
      const extracted = ExtractedLabelDataSchema.parse(c.mockExtraction);
      const verification = await runVerificationPipeline({
        extracted,
        expected: appParsed,
        words: wordsFromText(c.mockOcr.rawText),
        rawText: c.mockOcr.rawText,
        imageDims: { width: 1024, height: 1280 },
        // Image-quality flags drive the demotion override (R-011).
        imageQuality:
          c.expected.imageQualityFlags.length > 0
            ? {
                poor: true,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                flags: c.expected.imageQualityFlags as any,
              }
            : undefined,
      });

      if (
        !overallMatches(
          verification.overall,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          c.expected.overall as any,
        )
      ) {
        failures.push(
          `${c.id} ${c.name}: overall=${verification.overall}, expected=${JSON.stringify(c.expected.overall)}`,
        );
        continue;
      }

      const byField = new Map<string, string>();
      for (const fr of verification.fieldResults) {
        byField.set(fr.field, fr.status);
      }
      for (const fe of c.expected.fieldExpectations) {
        const got = byField.get(fe.field);
        if (!got) {
          failures.push(
            `${c.id} ${c.name}: field=${fe.field} missing from pipeline output`,
          );
          continue;
        }
        if (
          !statusMatches(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            got as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            fe.status as any,
          )
        ) {
          failures.push(
            `${c.id} ${c.name}: field=${fe.field} status=${got}, expected=${JSON.stringify(fe.status)}`,
          );
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("every gov-warning recall case produces overall=fail with governmentWarning=fail", async () => {
    const failures: string[] = [];
    for (const c of loadGolden().filter((c) => c.expected.mustReachGovWarningFail)) {
      const appParsed = ApplicationDataSchema.parse(c.input.expectedData);
      const extracted = ExtractedLabelDataSchema.parse(c.mockExtraction);
      const verification = await runVerificationPipeline({
        extracted,
        expected: appParsed,
        words: wordsFromText(c.mockOcr.rawText),
        rawText: c.mockOcr.rawText,
        imageDims: { width: 1024, height: 1280 },
      });
      const gov = verification.fieldResults.find(
        (fr) => fr.field === "governmentWarning",
      );
      if (verification.overall !== "fail" || gov?.status !== "fail") {
        failures.push(
          `${c.id} ${c.name}: overall=${verification.overall}, gov=${gov?.status ?? "missing"}`,
        );
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
