/**
 * Vision-LLM prompt + tool schema for label-field extraction.
 *
 * The model must respond by calling the single tool `record_label_fields`
 * exactly once, with the structured shape that mirrors `ExtractedLabelData`
 * (PRD §13.2). Strict tool-use mode is enforced server-side.
 *
 * Notes worth preserving:
 *
 * - Each per-field object MUST include `value`, `evidenceQuote`, and
 *   `confidence ∈ [0, 1]`.
 * - When a field is not visible the model returns `null` for both `value`
 *   and `evidenceQuote`. `confidence` should be 0 or close to it.
 * - The government-warning text is captured verbatim — capitalization,
 *   punctuation and line breaks must NOT be normalized. Tesseract.js is
 *   the ground-truth source for the `27 CFR § 16.21` strict check, but
 *   we still want the LLM's reading to match the page so verification
 *   has a defensive cross-check.
 */

export const EXTRACT_FIELDS_TOOL_NAME = "record_label_fields";

const PER_FIELD_SCHEMA_OBJECT = {
  type: "object",
  additionalProperties: false,
  properties: {
    value: {
      anyOf: [
        { type: "string" },
        { type: "number" },
        { type: "boolean" },
        { type: "null" },
      ],
      description:
        "The literal value visible on the label, or null if the field is not visible.",
    },
    evidenceQuote: {
      // OpenAI strict mode rejects the JSON-Schema array form `type: [..]` for
      // unions — they require an `anyOf` of single-type schemas instead.
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "Verbatim source string copied from the label that supports this value, or null when the field is not visible. Do not normalize capitalization or punctuation.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description:
        "Self-reported confidence in the extracted value, in [0, 1].",
    },
  },
  required: ["value", "evidenceQuote", "confidence"],
} as const;

/**
 * JSON Schema for the structured-output tool. Strict mode + a single tool
 * call gives us deterministic shape; downstream Zod parsing validates the
 * payload before it leaves the API route.
 */
export const EXTRACT_FIELDS_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: EXTRACT_FIELDS_TOOL_NAME,
    description:
      "Record the structured fields extracted from an alcohol-label image.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        brand: PER_FIELD_SCHEMA_OBJECT,
        classType: PER_FIELD_SCHEMA_OBJECT,
        alcoholContentText: PER_FIELD_SCHEMA_OBJECT,
        abvPercent: PER_FIELD_SCHEMA_OBJECT,
        proof: PER_FIELD_SCHEMA_OBJECT,
        netContents: PER_FIELD_SCHEMA_OBJECT,
        bottlerName: PER_FIELD_SCHEMA_OBJECT,
        bottlerAddress: PER_FIELD_SCHEMA_OBJECT,
        countryOfOrigin: PER_FIELD_SCHEMA_OBJECT,
        governmentWarningText: PER_FIELD_SCHEMA_OBJECT,
        rawText: {
          anyOf: [{ type: "string" }, { type: "null" }],
          description:
            "Optional full-label OCR text. Leave null in the LLM response — Tesseract.js fills this in slice 0003.",
        },
        imageQualityNotes: {
          type: "array",
          items: { type: "string" },
          description:
            "Plain-English notes on image quality issues, e.g. 'glare obscures the upper-left corner'. Empty array if none.",
        },
        extractionConfidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description:
            "Overall confidence in the entire extraction across fields, in [0, 1].",
        },
      },
      required: [
        "brand",
        "classType",
        "alcoholContentText",
        "abvPercent",
        "proof",
        "netContents",
        "bottlerName",
        "bottlerAddress",
        "countryOfOrigin",
        "governmentWarningText",
        "rawText",
        "imageQualityNotes",
        "extractionConfidence",
      ],
    },
  },
} as const;

export const EXTRACT_FIELDS_SYSTEM_PROMPT = [
  "You are proofLens, a strict TTB compliance reviewer's assistant.",
  "You read a single alcohol-label artwork and report the visible fields verbatim.",
  "You MUST respond by calling the `record_label_fields` tool exactly once.",
  "",
  "Rules you must follow:",
  "- For each per-field object, supply `value`, `evidenceQuote`, and `confidence`.",
  "- If a field is not visible on the label, set `value` and `evidenceQuote` to `null` and `confidence` to 0.",
  "- `evidenceQuote` is a verbatim copy of the source string from the label. Do NOT normalize capitalization, punctuation, or whitespace.",
  "- Capture the entire government-warning paragraph in `governmentWarningText.value`. Preserve the original capitalization exactly — including the literal `GOVERNMENT WARNING:` prefix if present.",
  "- `abvPercent.value` is the numeric ABV (e.g. 45 for `45% Alc./Vol.`). `proof.value` is the numeric proof.",
  "- `netContents.value` is the visible quantity string with its unit (e.g. `750 mL`).",
  "- `imageQualityNotes` is a short list of plain-English issues you observed (glare, blur, perspective, low contrast). Empty array if none.",
  "- `rawText` is always `null` in your response. A separate OCR pipeline produces it.",
  "- `extractionConfidence` is your overall confidence across the whole label.",
  "- Do not invent values that are not visible. Honesty + null beats hallucination.",
].join("\n");

export const EXTRACT_FIELDS_USER_PROMPT =
  "Extract the visible label fields per the rules above and call `record_label_fields`.";
