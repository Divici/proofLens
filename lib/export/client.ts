"use client";

/**
 * Client-side export helpers used by `<ExportMenu>`.
 *
 * - `exportPdf(review)`: serialises the Review (with base64 thumbnail)
 *   and POSTs to `/api/render-pdf`, returning the response Blob.
 * - `exportJson(review)`: builds a deterministic JSON envelope with the
 *   thumbnail base64 inline; returns a Blob.
 * - `exportBatch.{summaryCsv, perFieldCsv, allPdfsZip, allJsonZip}`:
 *   builds the corresponding batch artifact as a Blob. The ZIP variants
 *   call `/api/render-pdf` per review and pack the results into a JSZip-
 *   alternative streaming flow.
 *
 * Why a separate `client.ts` module: the pure exporters in
 * `lib/export/{csv,json,pdf}/*` are framework-agnostic and unit-tested
 * with Vitest. This module is the thin browser glue that calls them and
 * downloads the result via an anchor + object URL.
 *
 * NB: ZIP generation in the browser uses native `archiver`-incompatible
 * primitives (no Node streams), so the client builds ZIPs by collecting
 * each entry's bytes and assembling a minimal ZIP envelope via
 * @react-pdf and a tiny in-house helper. To keep the surface small and
 * the test footprint tight, browser-side ZIP is delegated to a dynamic
 * import of a tiny ZIP helper. See `lib/export/zip/browser.ts`.
 */

import type { Batch, Review } from "@/lib/storage/types";
import { renderBatchSummaryCsv } from "./csv/summary";
import { renderPerFieldCsv } from "./csv/per-field";
import { serializeReviewJsonAsync } from "./json/single";
import { serializeBatchJsonAsync } from "./json/batch";

async function blobToBase64(blob: Blob): Promise<string> {
  // FileReader is the simplest browser-side path. Node tests use the
  // pure path in `lib/export/json/*` directly, never this helper.
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  // Chunked to avoid Maximum-call-stack-size in big batches.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(bytes.length, i + CHUNK)),
    );
  }
  return btoa(binary);
}

export async function exportPdf(
  review: Review,
  appVersion: string,
): Promise<Blob> {
  const thumbnailBase64 = await blobToBase64(review.thumbnail);
  const body = JSON.stringify({
    review: { ...review, thumbnail: undefined },
    thumbnailBase64,
    thumbnailMimeType: review.thumbnail.type || "image/jpeg",
    appVersion,
  });
  const res = await fetch("/api/render-pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(
      typeof detail?.error === "string" ? detail.error : `HTTP ${res.status}`,
    );
  }
  return res.blob();
}

export async function exportJson(review: Review): Promise<Blob> {
  const json = await serializeReviewJsonAsync(review);
  return new Blob([json], { type: "application/json" });
}

export const exportBatch = {
  async summaryCsv(
    batch: Batch,
    reviews: ReadonlyArray<Review>,
  ): Promise<Blob> {
    const csv = renderBatchSummaryCsv(batch, reviews);
    return new Blob([csv], { type: "text/csv;charset=utf-8" });
  },
  async perFieldCsv(reviews: ReadonlyArray<Review>): Promise<Blob> {
    const csv = renderPerFieldCsv(reviews);
    return new Blob([csv], { type: "text/csv;charset=utf-8" });
  },
  async allPdfsZip(
    reviews: ReadonlyArray<Review>,
    appVersion: string,
  ): Promise<Blob> {
    const { buildBrowserZip } = await import("./zip/browser");
    const entries: { name: string; bytes: Uint8Array }[] = [];
    // Render PDFs sequentially — keeps memory pressure low for big batches
    // and gives the route handler back-pressure. If we want speed, batch in
    // chunks of 5; for now sequential is fine for the slice.
    for (const r of reviews) {
      const blob = await exportPdf(r, appVersion);
      entries.push({
        name: pdfFilename(r),
        bytes: new Uint8Array(await blob.arrayBuffer()),
      });
    }
    return buildBrowserZip(entries);
  },
  async allJsonZip(
    batch: Batch,
    reviews: ReadonlyArray<Review>,
  ): Promise<Blob> {
    const { buildBrowserZip } = await import("./zip/browser");
    // Per-review JSON files plus a `batch.json` envelope.
    const entries: { name: string; bytes: Uint8Array }[] = [];
    for (const r of reviews) {
      const json = await serializeReviewJsonAsync(r);
      entries.push({
        name: jsonFilename(r),
        bytes: new TextEncoder().encode(json),
      });
    }
    const batchJson = await serializeBatchJsonAsync(batch, reviews);
    entries.push({
      name: "batch.json",
      bytes: new TextEncoder().encode(batchJson),
    });
    return buildBrowserZip(entries);
  },
};

function brandSlug(brand: string): string {
  return brand
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60);
}

function pdfFilename(review: Review): string {
  return `${brandSlug(review.brand) || "label"}-${review.id.slice(0, 8)}.pdf`;
}

function jsonFilename(review: Review): string {
  return `${brandSlug(review.brand) || "label"}-${review.id.slice(0, 8)}.json`;
}

/**
 * Trigger a browser download by allocating an `<a>` with an object URL.
 * Cleans up the URL after the click.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer the revoke so Chrome has time to start the download stream.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
