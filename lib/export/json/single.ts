/**
 * Single-review JSON serializer (R-015).
 *
 * Reviews live in IndexedDB with the thumbnail as a Blob. Blobs can't
 * round-trip through JSON, so we base64-encode the thumbnail and keep
 * its mime type alongside. Output is alphabetically sorted at every
 * object level for byte-stable exports — two serialisations of the
 * same review produce identical bytes (when `now` is held constant),
 * so reviewers can checksum their audit-trail files.
 *
 * Pure helper: tests pass `now: () => Date` so timestamps are
 * deterministic. The page wires `() => new Date()` at the call site.
 */

import type { Review } from "@/lib/storage/types";
import { stringifyAlphabetic } from "./sort";

export const SCHEMA_VERSION = "prooflens-review/2026-04-29" as const;

export interface SerializeReviewOptions {
  now?: () => Date;
}

interface ExportEnvelope {
  exportedAt: string;
  review: Record<string, unknown>;
  schemaVersion: typeof SCHEMA_VERSION;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = Buffer.from(await blob.arrayBuffer());
  return buf.toString("base64");
}

/**
 * Async serializer. Reads the thumbnail Blob → base64. This is the only
 * path; the underlying Blob → bytes API is async by spec.
 */
export async function serializeReviewJsonAsync(
  review: Review,
  opts: SerializeReviewOptions = {},
): Promise<string> {
  const base64 = await blobToBase64(review.thumbnail);
  const envelope: ExportEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: (opts.now ?? (() => new Date()))().toISOString(),
    review: reviewToPlain(review, base64),
  };
  return stringifyAlphabetic(envelope);
}

/**
 * Sync convenience for callers who already have the base64 thumbnail
 * (e.g. tests, batch exporters that pre-decode every blob in parallel).
 */
export function serializeReviewJson(
  review: Review,
  opts: SerializeReviewOptions & { thumbnailBase64?: string } = {},
): string {
  const envelope: ExportEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: (opts.now ?? (() => new Date()))().toISOString(),
    review: reviewToPlain(review, opts.thumbnailBase64 ?? ""),
  };
  return stringifyAlphabetic(envelope);
}

function reviewToPlain(
  review: Review,
  thumbnailBase64: string,
): Record<string, unknown> {
  // Spread → drop the Blob → add the base64 + mime fields. Top-level
  // sorting is handled by `stringifyAlphabetic`.
  const { thumbnail: _thumbnail, ...rest } = review;
  void _thumbnail;
  return {
    ...rest,
    thumbnailBase64,
    thumbnailMimeType: "image/jpeg",
  };
}
