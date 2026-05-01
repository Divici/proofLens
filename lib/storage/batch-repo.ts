"use client";

import { openDb } from "./db";
import type { Batch, Review } from "./types";

/**
 * Batch persistence (R-014 extension, slice 0007).
 *
 * Each batch run produces:
 *   • One `Batch` record on `db.batch`
 *   • N `Review` records on `db.review` (one per file that completed)
 *
 * `saveBatchWithReviews` writes both stores in a single IndexedDB
 * transaction so the batch and its reviews can never disagree if a
 * second tab tries to mutate state mid-write.
 *
 * `hydrateBatch` is the inverse — given a batch id, fetch the batch and
 * every review it points at, gracefully tolerating reviews that were
 * deleted out of band (older slice 0009 cleanup flows can leave dangling
 * `reviewIds` and we don't want the batch detail page to crash).
 */

export async function createBatch(batch: Batch): Promise<void> {
  const db = await openDb();
  await db.put("batch", batch);
}

export async function getBatch(id: string): Promise<Batch | null> {
  const db = await openDb();
  const row = await db.get("batch", id);
  return row ?? null;
}

export async function listBatches(): Promise<Batch[]> {
  const db = await openDb();
  const all = await db.getAllFromIndex("batch", "createdAt");
  return all.reverse();
}

export async function deleteBatch(id: string): Promise<void> {
  const db = await openDb();
  await db.delete("batch", id);
}

/**
 * Transactional write of a batch and its associated review records.
 *
 * Both stores are touched inside the same IDB transaction; if any `put`
 * throws, the transaction aborts and nothing persists — the caller can
 * surface a single error rather than a partial state.
 */
export async function saveBatchWithReviews(
  batch: Batch,
  reviews: ReadonlyArray<Review>,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["batch", "review"], "readwrite");
  const reviewStore = tx.objectStore("review");
  const batchStore = tx.objectStore("batch");
  // Issue all writes; the transaction completes (or aborts) atomically.
  await Promise.all([
    ...reviews.map((r) => reviewStore.put(r)),
    batchStore.put(batch),
    tx.done,
  ]);
}

export interface HydratedBatch {
  batch: Batch;
  reviews: Review[];
}

/**
 * Fetch a batch + every review it references. Missing reviews (deleted
 * out of band) are silently skipped — the UI will indicate "1 review
 * missing" via summary counts vs. hydrated length.
 */
export async function hydrateBatch(id: string): Promise<HydratedBatch | null> {
  const db = await openDb();
  const tx = db.transaction(["batch", "review"], "readonly");
  const batch = await tx.objectStore("batch").get(id);
  if (!batch) {
    await tx.done;
    return null;
  }
  const reviewStore = tx.objectStore("review");
  const fetched = await Promise.all(
    batch.reviewIds.map((rid) => reviewStore.get(rid)),
  );
  await tx.done;
  const reviews = fetched.filter(
    (r): r is Review => r !== undefined,
  );
  return { batch, reviews };
}
