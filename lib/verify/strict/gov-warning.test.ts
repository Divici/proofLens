import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { govWarningMatch } from "./gov-warning";
import { GOV_WARNING_CANONICAL } from "./gov-warning-canonical";
import { canonicalMutations } from "@/test/fixtures/mutations/gov-warning-mutations";

describe("govWarningMatch — three-layer strict matcher", () => {
  it("passes the canonical § 16.21 string verbatim", () => {
    const result = govWarningMatch(GOV_WARNING_CANONICAL);
    expect(result.status).toBe("pass");
  });

  it("passes when extra leading/trailing whitespace is present (Layer 2 normalises)", () => {
    const padded = "   " + GOV_WARNING_CANONICAL + "  \n";
    const result = govWarningMatch(padded);
    expect(result.status).toBe("pass");
  });

  it("passes when smart quotes are injected around (1)/(2) but body is otherwise canonical", () => {
    // NFKC + smart-quote fold should normalise these back, leaving the
    // canonical body unchanged.
    const withSmartParens = GOV_WARNING_CANONICAL.replace(
      /\(1\)/,
      "(1)",
    ).replace(/\(2\)/, "(2)");
    const result = govWarningMatch(withSmartParens);
    expect(result.status).toBe("pass");
  });

  it("fails when the prefix is missing entirely", () => {
    const noPrefix = GOV_WARNING_CANONICAL.slice(
      "GOVERNMENT WARNING: ".length,
    );
    const result = govWarningMatch(noPrefix);
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("prefix_missing");
  });

  it("fails when the prefix is lowercased", () => {
    const lower = GOV_WARNING_CANONICAL.replace(
      "GOVERNMENT WARNING:",
      "government warning:",
    );
    const result = govWarningMatch(lower);
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("prefix_capitalization");
  });

  it("fails when the prefix is title-cased", () => {
    const title = GOV_WARNING_CANONICAL.replace(
      "GOVERNMENT WARNING:",
      "Government Warning:",
    );
    const result = govWarningMatch(title);
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("prefix_capitalization");
  });

  it("fails when the comma after 'Surgeon General' is missing", () => {
    const noComma = GOV_WARNING_CANONICAL.replace(
      "Surgeon General,",
      "Surgeon General",
    );
    const result = govWarningMatch(noComma);
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("wording_mismatch");
  });

  it("fails when the comma after 'or operate machinery' is missing", () => {
    const noComma = GOV_WARNING_CANONICAL.replace(
      "or operate machinery,",
      "or operate machinery",
    );
    const result = govWarningMatch(noComma);
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("wording_mismatch");
  });

  it("fails when a body word is substituted", () => {
    const swapped = GOV_WARNING_CANONICAL.replace(
      "health problems",
      "health issues",
    );
    const result = govWarningMatch(swapped);
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("wording_mismatch");
  });

  it("fails when the sentences are reordered", () => {
    const reordered =
      "GOVERNMENT WARNING: (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems. (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects.";
    const result = govWarningMatch(reordered);
    expect(result.status).toBe("fail");
  });

  it("returns a Damerau-Levenshtein distance for diagnostic prose on near-misses", () => {
    const oneCharOff =
      GOV_WARNING_CANONICAL.slice(0, -2) +
      "x" +
      GOV_WARNING_CANONICAL.slice(-1);
    const result = govWarningMatch(oneCharOff);
    expect(result.status).toBe("fail");
    expect(typeof result.distance).toBe("number");
    expect(result.distance).toBeGreaterThan(0);
  });

  it("rejects empty input as missing", () => {
    const result = govWarningMatch("");
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("prefix_missing");
  });

  // ---- CI mutation fuzz harness ---------------------------------------
  // This is the strict-recall safety net. ≥ 100 generated mutations must
  // ALL be rejected by the matcher; the build fails if any slips through.
  it("rejects every fast-check mutation of the canonical string (≥ 100 runs)", () => {
    fc.assert(
      fc.property(canonicalMutations(), (mutated) => {
        const result = govWarningMatch(mutated);
        return result.status === "fail";
      }),
      { numRuns: 100 },
    );
  });
});
