"use client";

import { openDb } from "./db";

/**
 * Sticky reviewer-name persistence + arbitrary settings storage.
 *
 * Per the slice spec, the reviewer-name field on `/review` should pre-fill
 * with the last-used name on subsequent visits. We park it in the
 * `settings` store under a stable key.
 */

export const REVIEWER_NAME_KEY = "reviewerName";

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  await db.put("settings", { key, value });
}

export async function getSetting<T = unknown>(
  key: string,
): Promise<T | null> {
  const db = await openDb();
  const row = await db.get("settings", key);
  return (row?.value ?? null) as T | null;
}

export async function setReviewerName(name: string): Promise<void> {
  await setSetting(REVIEWER_NAME_KEY, name);
}

export async function getReviewerName(): Promise<string | null> {
  return getSetting<string>(REVIEWER_NAME_KEY);
}
