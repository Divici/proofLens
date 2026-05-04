// @vitest-environment node
/**
 * Phase 5 — round-trip + visibility regression for the new RuleOutcome
 * kinds added since slice 0008's export schema was last frozen:
 *
 *   - `bottler_function_phrase_missing`  (ADR 0009)
 *   - `net_contents_non_standard_fill`   (TTB §§ 4.72 / 5.203)
 *   - `nuanced_pass_normalised`          (Phase 2 §3 #5 — rung-1 promotion)
 *
 * Three contracts the user must rely on:
 *   1. JSON export preserves every outcome kind + detail intact.
 *   2. PDF audit trail shows the templated explanation prose for each
 *      field (NOT just the status pill).
 *   3. CSV per-field row carries the explanation prose so reviewers can
 *      analyse a batch in a spreadsheet without opening every PDF.
 *
 * Without these, a saved review's "why" is invisible to anyone reading
 * the export — the audit-of-record (per templates.ts comment) breaks.
 */
import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { isValidElement } from "react";
import { ReviewReport } from "./pdf/template";
import { renderPerFieldCsv } from "./csv/per-field";
import { serializeReviewJson } from "./json/single";
import { renderExplanation } from "@/lib/verify/explain/render";
import {
  makeReviewFixture,
  makeFieldResults,
} from "@/test/fixtures/review";
import type { FieldResult, RuleOutcome } from "@/lib/verify/types";

interface AnyEl {
  type: unknown;
  props: { children?: unknown };
}

function collectText(node: unknown): string[] {
  const out: string[] = [];
  function walk(n: unknown) {
    if (n == null || n === false) return;
    if (typeof n === "string" || typeof n === "number") {
      out.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) walk(c);
      return;
    }
    if (isValidElement(n)) {
      const el = n as unknown as AnyEl;
      walk(el.props.children);
    }
  }
  walk(node);
  return out;
}

function fieldsWithNewOutcomes(): FieldResult[] {
  // One row per new RuleOutcome kind so a single fixture exercises them
  // all. The explanation text is precomputed via the same `renderExplanation`
  // path the pipeline uses so the test fixture is byte-identical to a
  // real saved review.

  const bottlerOutcome: RuleOutcome = {
    kind: "bottler_function_phrase_missing",
    detail: {},
  };
  const netContentsOutcome: RuleOutcome = {
    kind: "net_contents_non_standard_fill",
    detail: {
      foundMl: 680,
      beverageType: "distilled-spirits",
      cfrSection: "§ 5.203",
    },
  };
  const passNormalisedOutcome: RuleOutcome = {
    kind: "nuanced_pass_normalised",
    detail: {
      similarity: 1,
      normalisedFound: "stones throw",
      normalisedExpected: "stones throw",
    },
  };

  const base = makeFieldResults();
  return [
    {
      ...base[0]!,
      field: "brand",
      label: "Brand name",
      status: "pass",
      value: "STONE'S THROW",
      expected: "Stone's Throw",
      outcomes: [passNormalisedOutcome],
      explanation: renderExplanation(passNormalisedOutcome),
    },
    {
      ...base[1]!,
      field: "netContents",
      label: "Net contents",
      status: "warning",
      value: "680 mL",
      expected: "680 mL",
      outcomes: [netContentsOutcome],
      explanation: renderExplanation(netContentsOutcome),
    },
    {
      ...base[2]!,
      field: "bottlerName",
      label: "Bottler / producer",
      status: "warning",
      value: "Old Tom Distillery, LLC",
      expected: "Old Tom Distillery, LLC",
      outcomes: [bottlerOutcome],
      explanation: renderExplanation(bottlerOutcome),
    },
  ];
}

describe("JSON export — new RuleOutcome kinds round-trip intact", () => {
  it("preserves outcome kinds and detail through serialize → JSON.parse", () => {
    const review = makeReviewFixture({
      fieldResults: fieldsWithNewOutcomes(),
    });
    const parsed = JSON.parse(serializeReviewJson(review));
    const fields = parsed.review.fieldResults as Array<{
      field: string;
      outcomes: Array<{ kind: string; detail: Record<string, unknown> }>;
    }>;

    const brand = fields.find((f) => f.field === "brand")!;
    expect(brand.outcomes[0]?.kind).toBe("nuanced_pass_normalised");

    const nc = fields.find((f) => f.field === "netContents")!;
    expect(nc.outcomes[0]?.kind).toBe("net_contents_non_standard_fill");
    expect(nc.outcomes[0]?.detail).toMatchObject({
      foundMl: 680,
      beverageType: "distilled-spirits",
      cfrSection: "§ 5.203",
    });

    const bn = fields.find((f) => f.field === "bottlerName")!;
    expect(bn.outcomes[0]?.kind).toBe("bottler_function_phrase_missing");
  });

  it("preserves the templated explanation prose for every new kind", () => {
    const review = makeReviewFixture({
      fieldResults: fieldsWithNewOutcomes(),
    });
    const parsed = JSON.parse(serializeReviewJson(review));
    const fields = parsed.review.fieldResults as Array<{
      field: string;
      explanation: string;
    }>;

    expect(fields.find((f) => f.field === "brand")?.explanation).toMatch(
      /case and punctuation normalisation/i,
    );
    expect(
      fields.find((f) => f.field === "netContents")?.explanation,
    ).toMatch(/standards of fill/i);
    expect(
      fields.find((f) => f.field === "bottlerName")?.explanation,
    ).toMatch(/function-describing phrase/i);
  });
});

describe("PDF export — explanation prose appears in the audit trail", () => {
  it("renders the explanation string for every regulated field, not just the status pill", () => {
    // The PDF is the audit-of-record per templates.ts. Without the
    // explanation appearing in the rendered tree, a printed copy gives
    // no rationale for the verdict — the reviewer can't defend the
    // decision later.
    const review = makeReviewFixture({
      fieldResults: fieldsWithNewOutcomes(),
    });
    const tree = ReviewReport({
      review,
      thumbnailDataUrl: "data:image/jpeg;base64,AAAA",
      appVersion: "0.1.0",
    });
    const text = collectText(tree).join("\n");

    // Each new outcome kind's templated prose must appear in the PDF.
    expect(text).toMatch(/case and punctuation normalisation/i);
    expect(text).toMatch(/standards of fill/i);
    expect(text).toMatch(/function-describing phrase/i);
  });
});

describe("CSV per-field — Explanation column carries the prose", () => {
  it("includes an Explanation column with the templated prose for each row", () => {
    const review = makeReviewFixture({
      fieldResults: fieldsWithNewOutcomes(),
    });
    const csv = renderPerFieldCsv([review]);
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    const rows = parsed.data;

    const brand = rows.find((r) => r["Field name"] === "brand")!;
    expect(brand["Explanation"]).toMatch(/case and punctuation normalisation/i);

    const nc = rows.find((r) => r["Field name"] === "netContents")!;
    expect(nc["Explanation"]).toMatch(/standards of fill/i);

    const bn = rows.find((r) => r["Field name"] === "bottlerName")!;
    expect(bn["Explanation"]).toMatch(/function-describing phrase/i);
  });
});
