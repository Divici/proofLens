"use client";

import { openDb } from "./db";
import type { Review, ReviewBeverageType } from "./types";
import type { OverallStatus } from "@/lib/verify/types";

/**
 * Repository helpers over the `review` object store.
 *
 * Search + filter happen entirely in JS over the indexed list — IndexedDB
 * cursors don't support multi-predicate queries cleanly, and the History
 * page is bounded by the user's quota (typically a few hundred records).
 * The `createdAt` index lets us pull rows newest-first cheaply.
 */

export interface ReviewQuery {
  /** Free-text search against `brand` and `reviewerName` (case-insensitive). */
  search?: string;
  /** Filter by overall status. */
  overall?: OverallStatus;
  /** Filter by beverage type. */
  beverageType?: ReviewBeverageType;
  /** True → only reviews with at least one human override. */
  hasOverrides?: boolean;
}

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

export async function searchReviews(
  query: ReviewQuery = {},
): Promise<Review[]> {
  const all = await listReviews();
  const search = query.search?.trim().toLowerCase() ?? "";

  return all.filter((r) => {
    if (query.overall && r.overall !== query.overall) return false;
    if (query.beverageType && r.beverageType !== query.beverageType) {
      return false;
    }
    if (query.hasOverrides !== undefined) {
      if (r.hasOverrides !== query.hasOverrides) return false;
    }
    if (search.length > 0) {
      const hay = `${r.brand} ${r.reviewerName}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}
