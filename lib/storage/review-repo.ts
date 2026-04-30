"use client";

import { openDb } from "./db";
import type { Review } from "./types";

/**
 * Repository helpers over the `review` object store.
 *
 * The History page filters in-memory (`components/ReviewHistoryList.tsx`)
 * over the result of `listReviews()`. We deliberately don't ship a
 * second filter implementation in the repo layer — at POC scale (low
 * hundreds of records) one filter is enough, and two would drift. If we
 * grow to thousands of records and want to push filtering into IndexedDB
 * cursors, slice 0009 (or later) can re-introduce a `searchReviews`
 * helper alongside the History rewrite.
 */

export async function createReview(review: Review): Promise<void> {
  const db = await openDb();
  await db.put("review", review);
}

export async function updateReview(review: Review): Promise<void> {
  const db = await openDb();
  await db.put("review", review);
}

export async function getReview(id: string): Promise<Review | null> {
  const db = await openDb();
  const row = await db.get("review", id);
  return row ?? null;
}

export async function deleteReview(id: string): Promise<void> {
  const db = await openDb();
  await db.delete("review", id);
}

/** Returns reviews newest-first via the `createdAt` index. */
export async function listReviews(): Promise<Review[]> {
  const db = await openDb();
  const all = await db.getAllFromIndex("review", "createdAt");
  return all.reverse();
}

export async function countReviews(): Promise<number> {
  const db = await openDb();
  return db.count("review");
}
