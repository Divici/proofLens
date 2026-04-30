"use client";

import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type { Batch, DemoData, Review, Setting } from "./types";

/**
 * proofLens IndexedDB schema.
 *
 * Per PRESEARCH §8.1 we store everything browser-local. Server endpoints
 * are stateless — they never see the saved review history. The four
 * stores match the spec exactly; a single `version` bump is required to
 * extend the schema.
 *
 * We expose a singleton `openDb()` so the app shares one connection.
 * `resetDb()` clears the cached handle so tests can rebuild from a fresh
 * `IDBFactory`.
 */

export const DB_NAME = "prooflens";
export const DB_VERSION = 1;

export interface ProofLensSchema extends DBSchema {
  review: {
    key: string;
    value: Review;
    indexes: {
      createdAt: string;
      reviewerName: string;
      brand: string;
      overall: string;
      beverageType: string;
    };
  };
  batch: {
    key: string;
    value: Batch;
    indexes: { createdAt: string };
  };
  demoData: {
    key: string;
    value: DemoData;
  };
  settings: {
    key: string;
    value: Setting;
  };
}

export type ProofLensDB = IDBPDatabase<ProofLensSchema>;

let dbPromise: Promise<ProofLensDB> | null = null;

/** Singleton IDB handle. Tests can call `resetDb()` between cases. */
export function openDb(): Promise<ProofLensDB> {
  if (!dbPromise) {
    dbPromise = openDB<ProofLensSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("review")) {
          const reviewStore = db.createObjectStore("review", {
            keyPath: "id",
          });
          reviewStore.createIndex("createdAt", "createdAt");
          reviewStore.createIndex("reviewerName", "reviewerName");
          reviewStore.createIndex("brand", "brand");
          reviewStore.createIndex("overall", "overall");
          reviewStore.createIndex("beverageType", "beverageType");
        }
        if (!db.objectStoreNames.contains("batch")) {
          const batchStore = db.createObjectStore("batch", {
            keyPath: "id",
          });
          batchStore.createIndex("createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("demoData")) {
          db.createObjectStore("demoData", { keyPath: "scenarioId" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      },
      blocked() {
        // Another tab is holding an older version open; nothing we can do
        // beyond surfacing a warning. The page reload usually fixes it.
        // eslint-disable-next-line no-console
        console.warn(
          "[prooflens-db] another tab is blocking an upgrade; close other tabs.",
        );
      },
      terminated() {
        // Browser closed the connection (e.g. on tab unload). Drop the
        // cached promise so the next call re-opens cleanly.
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/** Reset the singleton — primarily for tests with a fresh `IDBFactory`. */
export function resetDb(): void {
  dbPromise = null;
}
