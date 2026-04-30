import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { DB_NAME, DB_VERSION, openDb, resetDb } from "./db";

describe("openDb", () => {
  beforeEach(() => {
    // Fresh in-memory IDB per test so version bumps and store creates run cleanly.
    globalThis.indexedDB = new IDBFactory();
    resetDb();
  });

  afterEach(() => {
    resetDb();
  });

  it("opens the proofLens db at the documented version", async () => {
    const db = await openDb();
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
  });

  it("creates the four documented object stores", async () => {
    const db = await openDb();
    const names = Array.from(db.objectStoreNames).sort();
    expect(names).toEqual(["batch", "demoData", "review", "settings"]);
  });

  it("review store uses keyPath 'id' and indexes createdAt + reviewerName", async () => {
    const db = await openDb();
    const tx = db.transaction("review", "readonly");
    const store = tx.objectStore("review");
    expect(store.keyPath).toBe("id");
    const indexNames = Array.from(store.indexNames).sort();
    expect(indexNames).toContain("createdAt");
    expect(indexNames).toContain("reviewerName");
  });

  it("returns a singleton db handle across calls", async () => {
    const a = await openDb();
    const b = await openDb();
    expect(a).toBe(b);
  });
});
