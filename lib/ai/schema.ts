import { z } from "zod";

/**
 * Shared Zod schemas for proofLens application + extracted label data.
 *
 * These power both the runtime validation in `/api/extract-label` and the
 * `react-hook-form` resolver in the manual entry form.
 *
 * - `ApplicationData` mirrors PRD §13.1 — what the reviewer types in.
 * - `ExtractedLabelData` mirrors PRD §13.2 — what the vision LLM returns.
 *
 * Per slice 0002 spec: every extracted field carries `value`,
 * `evidenceQuote`, and `confidence ∈ [0, 1]`. Unset values are explicit
 * `null` so we can distinguish "not visible" from "field missing".
 */

export const BeverageTypeSchema = z.enum([
  "distilled-spirits",
  "wine",
  "malt-beverage",
  "unknown",
]);

export type BeverageType = z.infer<typeof BeverageTypeSchema>;

export const ApplicationDataSchema = z.object({
  brand: z.string().min(1, "Brand name is required"),
  classType: z.string().min(1, "Class/type designation is required"),
  abv: z
    .number({ invalid_type_error: "ABV must be a number" })
    .min(0, "ABV cannot be negative")
    .max(100, "ABV cannot exceed 100"),
  netContents: z.string().min(1, "Net contents is required"),
  bottlerName: z.string().min(1, "Bottler / producer name is required"),
  bottlerAddress: z.string().min(1, "Bottler / producer address is required"),
  countryOfOrigin: z.string().min(1, "Country of origin is required"),
  govWarningRequired: z.boolean(),
  applicationNotes: z.string().default(""),
  beverageType: BeverageTypeSchema,
});

export type ApplicationData = z.infer<typeof ApplicationDataSchema>;

/**
 * Per-field extraction shape. Each visible label field is reported with the
 * literal value (where available), the source string the model relied on,
 * and a self-reported confidence ∈ [0, 1].
 *
 * `null` values are first-class: they represent "not visible on the label",
 * which is a meaningful signal during verification rather than a missing
 * data point.
 */
export const ExtractedFieldSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  evidenceQuote: z.string().nullable(),
  confidence: z
    .number()
    .min(0, "confidence must be ≥ 0")
    .max(1, "confidence must be ≤ 1"),
});

export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;

export const ExtractedLabelDataSchema = z.object({
  brand: ExtractedFieldSchema,
  classType: ExtractedFieldSchema,
  alcoholContentText: ExtractedFieldSchema,
  abvPercent: ExtractedFieldSchema,
  proof: ExtractedFieldSchema,
  netContents: ExtractedFieldSchema,
  bottlerName: ExtractedFieldSchema,
  bottlerAddress: ExtractedFieldSchema,
  countryOfOrigin: ExtractedFieldSchema,
  governmentWarningText: ExtractedFieldSchema,
  /**
   * Raw OCR text (Tesseract.js output). LLM extraction does not produce
   * this — it lands in slice 0003. Nullable for now so the schema tracks
   * the eventual shape without forcing a value.
   */
  rawText: z.string().nullable(),
  imageQualityNotes: z.array(z.string()),
  extractionConfidence: z
    .number()
    .min(0, "extractionConfidence must be ≥ 0")
    .max(1, "extractionConfidence must be ≤ 1"),
});

export type ExtractedLabelData = z.infer<typeof ExtractedLabelDataSchema>;

/**
 * Field display metadata, used by the UI to render the extracted-data
 * card with stable label order + human-readable names.
 */
export const EXTRACTED_FIELD_LABELS: Array<{
  key: keyof Omit<
    ExtractedLabelData,
    "rawText" | "imageQualityNotes" | "extractionConfidence"
  >;
  label: string;
}> = [
  { key: "brand", label: "Brand name" },
  { key: "classType", label: "Class / type" },
  { key: "alcoholContentText", label: "Alcohol content (text)" },
  { key: "abvPercent", label: "ABV (%)" },
  { key: "proof", label: "Proof" },
  { key: "netContents", label: "Net contents" },
  { key: "bottlerName", label: "Bottler / producer name" },
  { key: "bottlerAddress", label: "Bottler / producer address" },
  { key: "countryOfOrigin", label: "Country of origin" },
  { key: "governmentWarningText", label: "Government warning text" },
];
