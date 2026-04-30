import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getQuotaStatus, isQuotaWarning } from "./quota";

const originalNavigator = globalThis.navigator;

function mockEstimate(usage: number, quota: number) {
  Object.defineProperty(globalThis, "navigator", {
    value: {
      ...originalNavigator,
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage, quota }),
      },
    },
    configurable: true,
  });
}

function clearStorage() {
  Object.defineProperty(globalThis, "navigator", {
    value: { ...originalNavigator, storage: undefined },
    configurable: true,
  });
}

describe("getQuotaStatus", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  });

  it("returns used / available / percentage when StorageManager is present", async () => {
    mockEstimate(50, 200);
    const status = await getQuotaStatus();
    expect(status.used).toBe(50);
    expect(status.available).toBe(200);
    expect(status.percentage).toBe(25);
    expect(status.supported).toBe(true);
  });

  it("rounds percentage to one decimal", async () => {
    mockEstimate(81, 250);
    const status = await getQuotaStatus();
    expect(status.percentage).toBeCloseTo(32.4, 1);
  });

  it("returns supported=false when StorageManager is missing", async () => {
    clearStorage();
    const status = await getQuotaStatus();
    expect(status.supported).toBe(false);
    expect(status.percentage).toBe(0);
  });

  it("guards against zero quota (no division-by-zero)", async () => {
    mockEstimate(0, 0);
    const status = await getQuotaStatus();
    expect(status.percentage).toBe(0);
  });

  it("isQuotaWarning is true at or above the 80% threshold", () => {
    expect(isQuotaWarning({ used: 80, available: 100, percentage: 80, supported: true })).toBe(true);
    expect(isQuotaWarning({ used: 79, available: 100, percentage: 79, supported: true })).toBe(false);
    expect(isQuotaWarning({ used: 0, available: 0, percentage: 0, supported: false })).toBe(false);
  });
});
