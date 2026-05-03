import { describe, expect, it } from "vitest";
import {
  resolveStrictStatus,
  resolveNuancedStatus,
  rollUpOverall,
} from "./status-engine";
import type { FieldResult } from "./types";

describe("resolveStrictStatus — strict cells collapse to {Pass, Fail, Missing, Low Confidence}", () => {
  it("returns 'pass' for matchPassed=true, ai high", () => {
    expect(
      resolveStrictStatus({ matchPassed: true, aiConfidence: 0.95 }),
    ).toBe("pass");
  });

  it("returns 'fail' for matchPassed=false, ai high", () => {
    expect(
      resolveStrictStatus({ matchPassed: false, aiConfidence: 0.95 }),
    ).toBe("fail");
  });

  it("returns 'low-confidence' for ai < 0.6 ONLY when match did not pass", () => {
    // When the deterministic strict matcher passes, the LLM's
    // self-doubt is moot — the value has been validated against
    // expected. Phase-9 user report: angled/glared real photo had
    // ai=0 across the board but every value matched expected; the
    // UI showed "Low confidence 0%" with explanation text "matches
    // exactly" — confusing.
    expect(
      resolveStrictStatus({ matchPassed: true, aiConfidence: 0.4 }),
    ).toBe("pass");
    expect(
      resolveStrictStatus({ matchPassed: false, aiConfidence: 0.4 }),
    ).toBe("low-confidence");
  });

  it("demotes a matched-but-low-AI cell to 'manual-review' when image quality is poor", () => {
    // Image-quality flag still wins: the reviewer sees Manual Review
    // with the Request-Better-Image action, but the underlying status
    // is acknowledged as a pass that needs a human eyeball, not as a
    // low-confidence extraction.
    expect(
      resolveStrictStatus({
        matchPassed: true,
        aiConfidence: 0.4,
        imageQualityPoor: true,
      }),
    ).toBe("manual-review");
  });

  it("returns 'missing' when extracted value is null", () => {
    expect(
      resolveStrictStatus({
        matchPassed: false,
        aiConfidence: 0.0,
        extractedNull: true,
      }),
    ).toBe("missing");
  });

  it("never returns 'likely-match' for strict fields", () => {
    const status = resolveStrictStatus({
      matchPassed: true,
      aiConfidence: 0.7,
    });
    expect(status).not.toBe("likely-match");
  });
});

describe("resolveNuancedStatus — full 8-state matrix", () => {
  it("returns 'pass' for ladder=pass, ai high", () => {
    expect(
      resolveNuancedStatus({ ladderKind: "pass", aiConfidence: 0.95 }),
    ).toBe("pass");
  });

  it("returns 'likely-match' for ladder=likely-match, ai high", () => {
    expect(
      resolveNuancedStatus({ ladderKind: "likely-match", aiConfidence: 0.9 }),
    ).toBe("likely-match");
  });

  it("returns 'manual-review' for ladder=manual-review", () => {
    expect(
      resolveNuancedStatus({ ladderKind: "manual-review", aiConfidence: 0.9 }),
    ).toBe("manual-review");
  });

  it("returns 'fail' for ladder=fail, ai high", () => {
    expect(
      resolveNuancedStatus({ ladderKind: "fail", aiConfidence: 0.95 }),
    ).toBe("fail");
  });

  it("returns 'warning' for ladder=fail with mid-confidence AI", () => {
    expect(
      resolveNuancedStatus({ ladderKind: "fail", aiConfidence: 0.7 }),
    ).toBe("warning");
  });

  it("returns 'low-confidence' for AI < 0.6 ONLY when ladder did not pass cleanly", () => {
    // Match-ladder passing IS the validation — LLM self-doubt is moot.
    // Same Phase-9 user report: real-photo nuanced fields with ai=0
    // showed "Low confidence" despite an exact ladder pass.
    expect(
      resolveNuancedStatus({ ladderKind: "pass", aiConfidence: 0.4 }),
    ).toBe("pass");
    expect(
      resolveNuancedStatus({ ladderKind: "fail", aiConfidence: 0.4 }),
    ).toBe("low-confidence");
    expect(
      resolveNuancedStatus({ ladderKind: "missing", aiConfidence: 0.4 }),
    ).toBe("missing");
  });

  it("demotes a ladder-pass + low-AI cell to 'manual-review' when image quality is poor", () => {
    expect(
      resolveNuancedStatus({
        ladderKind: "pass",
        aiConfidence: 0.4,
        imageQualityPoor: true,
      }),
    ).toBe("manual-review");
  });

  it("returns 'missing' when ladder is missing", () => {
    expect(
      resolveNuancedStatus({ ladderKind: "missing", aiConfidence: 0.9 }),
    ).toBe("missing");
  });
});

describe("rollUpOverall", () => {
  function field(status: FieldResult["status"]): FieldResult {
    return {
      field: "x",
      label: "X",
      status,
      value: null,
      expected: null,
      confidence: 0.9,
      explanation: "",
      suggestedAction: "",
      evidenceQuote: null,
      bbox: null,
      outcomes: [],
    };
  }

  it("returns 'pass' when all fields are pass", () => {
    expect(rollUpOverall([field("pass"), field("pass")])).toBe("pass");
  });

  it("returns 'fail' when any field is fail", () => {
    expect(
      rollUpOverall([field("pass"), field("fail"), field("pass")]),
    ).toBe("fail");
  });

  it("returns 'pass-with-warnings' when warning + no fail", () => {
    expect(
      rollUpOverall([
        field("pass"),
        field("warning"),
        field("likely-match"),
      ]),
    ).toBe("pass-with-warnings");
  });

  it("returns 'needs-manual-review' when manual-review + no fail", () => {
    expect(
      rollUpOverall([field("pass"), field("manual-review")]),
    ).toBe("needs-manual-review");
  });

  it("returns 'request-better-image' when low-confidence dominates", () => {
    expect(
      rollUpOverall([
        field("pass"),
        field("low-confidence"),
        field("low-confidence"),
      ]),
    ).toBe("request-better-image");
  });

  it("treats not-required as inert", () => {
    expect(
      rollUpOverall([field("pass"), field("not-required"), field("pass")]),
    ).toBe("pass");
  });

  // R-012 regression — Phase 9 user-reported bug: overriding every fail
  // to pass on /review left the saved review (and the confirmation pane)
  // showing fail because the rollup ignored humanOverride.humanStatus.
  describe("honors human overrides", () => {
    function withOverride(
      status: FieldResult["status"],
      humanStatus: FieldResult["status"],
    ): FieldResult {
      return {
        ...field(status),
        humanOverride: {
          originalAiStatus: status,
          humanStatus,
          reason: "test override",
          timestamp: "2026-05-02T00:00:00.000Z",
          reviewerName: "Reviewer",
        },
      };
    }

    it("returns 'pass' when every fail is overridden to pass", () => {
      expect(
        rollUpOverall([
          withOverride("fail", "pass"),
          withOverride("fail", "pass"),
          field("pass"),
        ]),
      ).toBe("pass");
    });

    it("returns 'fail' when an override flips a pass to fail", () => {
      expect(
        rollUpOverall([
          field("pass"),
          withOverride("pass", "fail"),
          field("pass"),
        ]),
      ).toBe("fail");
    });

    it("override to manual-review surfaces in the rollup", () => {
      expect(
        rollUpOverall([
          field("pass"),
          withOverride("fail", "manual-review"),
        ]),
      ).toBe("needs-manual-review");
    });

    it("override to not-required removes that field from the rollup", () => {
      expect(
        rollUpOverall([
          field("pass"),
          withOverride("fail", "not-required"),
        ]),
      ).toBe("pass");
    });
  });
});

describe("image-quality override (slice 0004 R-011)", () => {
  it("strict: quality flag + Pass cell → manual-review", () => {
    expect(
      resolveStrictStatus({
        matchPassed: true,
        aiConfidence: 0.95,
        imageQualityPoor: true,
      }),
    ).toBe("manual-review");
  });

  it("strict: quality flag + Fail cell preserves Fail (strict-fails stay strict)", () => {
    expect(
      resolveStrictStatus({
        matchPassed: false,
        aiConfidence: 0.95,
        imageQualityPoor: true,
      }),
    ).toBe("fail");
  });

  it("strict: quality flag + Missing cell preserves Missing", () => {
    expect(
      resolveStrictStatus({
        matchPassed: false,
        aiConfidence: 0,
        extractedNull: true,
        imageQualityPoor: true,
      }),
    ).toBe("missing");
  });

  it("strict: quality flag does not affect Pass when not poor", () => {
    expect(
      resolveStrictStatus({
        matchPassed: true,
        aiConfidence: 0.95,
        imageQualityPoor: false,
      }),
    ).toBe("pass");
  });

  it("nuanced: quality flag + ladder=pass → manual-review", () => {
    expect(
      resolveNuancedStatus({
        ladderKind: "pass",
        aiConfidence: 0.95,
        imageQualityPoor: true,
      }),
    ).toBe("manual-review");
  });

  it("nuanced: quality flag + ladder=likely-match → manual-review", () => {
    expect(
      resolveNuancedStatus({
        ladderKind: "likely-match",
        aiConfidence: 0.95,
        imageQualityPoor: true,
      }),
    ).toBe("manual-review");
  });

  it("nuanced: quality flag + ladder=fail → fail (preserves strict signal)", () => {
    expect(
      resolveNuancedStatus({
        ladderKind: "fail",
        aiConfidence: 0.95,
        imageQualityPoor: true,
      }),
    ).toBe("fail");
  });
});
