/**
 * Wire-payload schema for `/api/render-pdf`.
 *
 * Reviews live in the browser's IndexedDB (per Marcus's IT note —
 * stateless server). When the client wants a PDF, it serialises the
 * Review, base64-encodes the thumbnail Blob, and POSTs the JSON envelope
 * defined here.
 *
 * The schema is intentionally permissive on the deeper Review subtree
 * (`expectedData`, `extracted`, `fieldResults`) — those structures are
 * already validated when the review was first written via the verify
 * pipeline, so re-validating their full Zod schema here would just add
 * brittleness. We assert the shape we _read_ to render the PDF:
 *   - `id`, `brand`, `reviewerName`, `createdAt`, `beverageType`,
 *     `rulesVersion`, `overall`, `fieldResults`, `decision` (optional)
 */

import { z } from "zod";
import { FieldResultSchema, OverallStatusSchema } from "@/lib/verify/types";

const HumanDecisionSchema = z.object({
  decision: z.enum([
    "approved",
    "rejected",
    "manual-review",
    "request-better-image",
  ]),
  notes: z.string(),
  reviewerName: z.string(),
  timestamp: z.string(),
});

export const SerializedReviewSchema = z
  .object({
    id: z.string(),
    createdAt: z.string(),
    reviewerName: z.string(),
    beverageType: z.enum(["beer", "wine", "spirits", "unknown"]),
    rulesVersion: z.string(),
    overall: OverallStatusSchema,
    fieldResults: z.array(FieldResultSchema),
    brand: z.string(),
    decision: HumanDecisionSchema.optional(),
    // Permissive on the rest — only these fields are read by the PDF
    // template (plus the explicit thumbnail data URL passed separately).
    // We use `z.unknown()` rather than `z.record(z.unknown())` because
    // these subtrees can legitimately be arrays (e.g. extracted's
    // imageQualityNotes) or scalars; the template is permissive about
    // their shape and the wire schema's job is to ensure the field is
    // *present*, not to police its inner structure.
    expectedData: z.unknown(),
    extracted: z.unknown(),
    imageQualityFlags: z.array(z.unknown()).default([]),
    bboxes: z.unknown().default({}),
    rawText: z.string().default(""),
    processingTimeMs: z.number().default(0),
    aiSpend: z
      .object({
        primaryUsd: z.number(),
        fallbackUsd: z.number(),
      })
      .default({ primaryUsd: 0, fallbackUsd: 0 }),
    ocrConfidence: z.number().default(0),
    imageWidth: z.number().default(0),
    imageHeight: z.number().default(0),
    hasOverrides: z.boolean().default(false),
  })
  .passthrough();

export const ReviewWirePayloadSchema = z.object({
  review: SerializedReviewSchema,
  thumbnailBase64: z.string().default(""),
  thumbnailMimeType: z.string().optional(),
  appVersion: z.string().min(1),
});

export type ReviewWirePayload = z.infer<typeof ReviewWirePayloadSchema>;
