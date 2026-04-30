import { z } from "zod";

/**
 * Shared verification-pipeline types.
 *
 * The eight-state field-status enum and the overall-status enum live here
 * (PRD §9.5/§9.6). Per-rule outcomes flow through `RuleOutcome`. The
 * `FieldResult` shape is what `/api/extract-label` and the UI both
 * consume.
 */

/** Per-field 8-state status enum (PRD §9.5). */
export const FieldStatusSchema = z.enum([
  "pass",
  "likely-match",
  "warning",
  "fail",
  "missing",
  "low-confidence",
  "manual-review",
  "not-required",
]);

export type FieldStatus = z.infer<typeof FieldStatusSchema>;

/** Roll-up status (PRD §9.6). */
export const OverallStatusSchema = z.enum([
  "pass",
  "pass-with-warnings",
  "fail",
  "needs-manual-review",
  "request-better-image",
]);

export type OverallStatus = z.infer<typeof OverallStatusSchema>;

/**
 * `RuleOutcome.kind` is a closed enum over every per-rule kind that the
 * verification pipeline can produce. The explanation registry has one
 * template per kind (`lib/verify/explain/templates.ts`).
 */
export const RuleOutcomeKindSchema = z.enum([
  // gov-warning matcher kinds
  "gov_warning_pass",
  "gov_warning_prefix_missing",
  "gov_warning_prefix_capitalization",
  "gov_warning_wording_mismatch",
  // ABV matcher kinds
  "abv_pass",
  "abv_unparseable",
  "abv_out_of_tolerance",
  "abv_internal_inconsistency",
  // Net-contents matcher kinds
  "net_contents_pass",
  "net_contents_unparseable",
  "net_contents_volume_mismatch",
  // Nuanced ladder kinds
  "nuanced_pass",
  "nuanced_likely_match",
  "nuanced_manual_review",
  "nuanced_fail",
  "nuanced_missing",
  // Generic
  "field_missing",
  "field_not_required",
  "field_low_confidence",
]);

export type RuleOutcomeKind = z.infer<typeof RuleOutcomeKindSchema>;

/**
 * Bbox in Tesseract's native `(x0, y0)` upper-left / `(x1, y1)` lower-right
 * coordinate system. The `imageWidth/Height` give the rendered preview
 * the canvas pixel dimensions to scale against.
 */
export const BoundingBoxSchema = z.object({
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
  imageWidth: z.number().positive(),
  imageHeight: z.number().positive(),
});

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

export const RuleOutcomeSchema = z.object({
  kind: RuleOutcomeKindSchema,
  detail: z.record(z.unknown()).default({}),
});

export type RuleOutcome = z.infer<typeof RuleOutcomeSchema>;

/**
 * Per-field human-override audit record (slice 0005, R-012). Captured
 * when the reviewer disagrees with the AI's verdict on a single field.
 * The original AI status is frozen on the record so the History UI can
 * render an "AI vs human" diff.
 */
export const FieldOverrideSchema = z.object({
  originalAiStatus: FieldStatusSchema,
  humanStatus: FieldStatusSchema,
  reason: z.string().max(500),
  timestamp: z.string(),
  reviewerName: z.string(),
});

export type FieldOverride = z.infer<typeof FieldOverrideSchema>;

export const FieldResultSchema = z.object({
  /** Stable field key (matches `ExtractedLabelData` keys). */
  field: z.string(),
  /** Human-friendly label for the UI (e.g. "Brand name"). */
  label: z.string(),
  status: FieldStatusSchema,
  /** Value the LLM extracted from the label. */
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  /** Expected value from the application form. */
  expected: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  /** Composite confidence (AI confidence × match strength). */
  confidence: z.number().min(0).max(1),
  /** Templated, rule-sourced explanation prose (audit of record). */
  explanation: z.string(),
  /** Suggested action for the reviewer (PRD §9.5). */
  suggestedAction: z.string(),
  /** Verbatim quote the LLM used as evidence. */
  evidenceQuote: z.string().nullable(),
  /** Polygon located in the Tesseract word stream (slice 0003 R-013). */
  bbox: BoundingBoxSchema.nullable(),
  /** Full rule trail for the audit log. */
  outcomes: z.array(RuleOutcomeSchema),
  /** Optional reviewer override (slice 0005, R-012). */
  humanOverride: FieldOverrideSchema.optional(),
});

export type FieldResult = z.infer<typeof FieldResultSchema>;
