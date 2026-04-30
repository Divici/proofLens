import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { resetDb } from "./db";
import {
  getReviewerName,
  REVIEWER_NAME_KEY,
  setReviewerName,
  setSetting,
  getSetting,
} from "./settings-repo";

describe("settings-repo", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDb();
  });
  afterEach(() => resetDb());

  it("stores and retrieves the reviewer name", async () => {
    await setReviewerName("Jane Doe");
    expect(await getReviewerName()).toBe("Jane Doe");
  });

  it("returns null when no reviewer name is stored", async () => {
    expect(await getReviewerName()).toBeNull();
  });

  it("stores and retrieves arbitrary settings by key", async () => {
    await setSetting("theme", "dark");
    expect(await getSetting<string>("theme")).toBe("dark");
  });

  it("uses the documented reviewer-name key", () => {
    expect(REVIEWER_NAME_KEY).toBe("reviewerName");
  });
});
