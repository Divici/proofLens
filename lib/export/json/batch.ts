/**
 * Batch JSON serializer (R-015) — wraps `{ batch: Batch, reviews: Review[] }`
 * with deterministic alphabetical key ordering for byte-stable exports.
 *
 * For prod calls that need real thumbnail bytes, use
 * `serializeBatchJsonAsync` (it reads each Blob → base64 in parallel).
 * The sync variant accepts pre-decoded base64 strings or omits them.
 */

import type { Batch, Review } from "@/lib/storage/types";
import { stringifyAlphabetic } from "./sort";

export const SCHEMA_VERSION = "prooflens-batch/2026-04-29" as const;

export interface SerializeBatchOptions {
  now?: () => Date;
  /**
   * Optional pre-decoded thumbnail base64 strings, keyed by review id.
   * When omitted the sync serializer emits empty strings for thumbnails.
   */
  thumbnailsBase64?: Record<string, string>;
}

interface ExportEnvelope {
  batch: Batch;
  exportedAt: string;
  reviews: Record<string, unknown>[];
  schemaVersion: typeof SCHEMA_VERSION;
}

function reviewToPlain(
  review: Review,
  thumbnailBase64: string,
): Record<string, unknown> {
  const { thumbnail: _thumbnail, ...rest } = review;
  void _thumbnail;
  return {
    ...rest,
    thumbnailBase64,
    thumbnailMimeType: "image/jpeg",
  };
}

export function serializeBatchJson(
  batch: Batch,
  reviews: ReadonlyArray<Review>,
  opts: SerializeBatchOptions = {},
): string {
  const envelope: ExportEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: (opts.now ?? (() => new Date()))().toISOString(),
    batch,
    reviews: reviews.map((r) =>
      reviewToPlain(r, opts.thumbnailsBase64?.[r.id] ?? ""),
    ),
  };
  return stringifyAlphabetic(envelope);
}

export async function serializeBatchJsonAsync(
  batch: Batch,
  reviews: ReadonlyArray<Review>,
  opts: Omit<SerializeBatchOptions, "thumbnailsBase64"> = {},
): Promise<string> {
  const thumbnailsBase64: Record<string, string> = {};
  await Promise.all(
    reviews.map(async (r) => {
      const buf = Buffer.from(await r.thumbnail.arrayBuffer());
      thumbnailsBase64[r.id] = buf.toString("base64");
    }),
  );
  return serializeBatchJson(batch, reviews, { ...opts, thumbnailsBase64 });
}
