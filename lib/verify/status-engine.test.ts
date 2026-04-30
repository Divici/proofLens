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

  it("returns 'low-confidence' for ai < 0.6", () => {
    expect(
      resolveStrictStatus({ matchPassed: true, aiConfidence: 0.4 }),
    ).toBe("low-confidence");
    expect(
      resolveStrictStatus({ matchPassed: false, aiConfidence: 0.4 }),
    ).toBe("low-confidence");
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

  it("returns 'low-confidence' when AI confidence < 0.6", () => {
    expect(
      resolveNuancedStatus({ ladderKind: "pass", aiConfidence: 0.4 }),
    ).toBe("low-confidence");
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
});
