"use client";

import { openDb } from "./db";
import type { Batch } from "./types";

/**
 * Slice 0007 lands the real batch flow. This module exists today only so
 * the schema (object store + index) is stable from slice 0005 onward,
 * which avoids an awkward IDB version bump later.
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
