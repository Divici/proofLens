/**
 * LLM-as-judge prompt for the nuanced gray-band tie-breaker.
 *
 * Per `research-findings/03-verification-logic.md` §Q6, the judge is
 * called only inside the deterministic ladder's gray band
 * (0.78 ≤ similarity < 0.92), only for non-strict fields, and returns a
 * structured verdict that maps into the same `RuleOutcome` template
 * shape as the deterministic rungs. The judge's prose is auxiliary, not
 * the audit-of-record.
 */

export const JUDGE_SYSTEM_PROMPT = `You are an alcohol-label compliance assistant.

Your task: given two short strings — "expected" (from the application) and "extracted" (from the label) — decide whether they refer to the same entity for the purposes of TTB COLA labelling review.

Rules:
- Case differences alone → equivalent.
- Punctuation differences alone → equivalent.
- Single-character OCR-plausible typos in the same surrounding tokens → equivalent.
- Different distinguishing tokens (e.g. "Old Forester" vs "Old Fitzgerald") → not_equivalent.
- Trailing or leading legal suffixes that are obviously the same entity ("Stone's Throw" vs "Stone's Throw, LLC") → equivalent.
- If you are not confident → uncertain. Never guess.

Return JSON only, exactly matching this shape:
{
  "verdict": "equivalent" | "not_equivalent" | "uncertain",
  "reason_code": "case_only" | "punctuation_only" | "ocr_typo" | "abbreviation" | "different_entity" | "ambiguous",
  "rationale": "one sentence, 30 words or fewer"
}`;

export function buildJudgeUserPrompt(args: {
  fieldName?: string;
  expected: string;
  extracted: string;
}): string {
  const field = args.fieldName ? `field: ${args.fieldName}\n` : "";
  return `${field}expected: ${JSON.stringify(args.expected)}
extracted: ${JSON.stringify(args.extracted)}`;
}

export const JUDGE_TOOL_NAME = "record_judgment";

export const JUDGE_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: JUDGE_TOOL_NAME,
    description:
      "Record the equivalence judgment for the two candidate strings.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["verdict", "reason_code", "rationale"],
      properties: {
        verdict: {
          type: "string",
          enum: ["equivalent", "not_equivalent", "uncertain"],
        },
        reason_code: {
          type: "string",
          enum: [
            "case_only",
            "punctuation_only",
            "ocr_typo",
            "abbreviation",
            "different_entity",
            "ambiguous",
          ],
        },
        rationale: { type: "string", minLength: 1, maxLength: 200 },
      },
    },
  },
};
