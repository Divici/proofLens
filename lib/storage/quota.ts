"use client";

/**
 * IndexedDB quota helper.
 *
 * Browsers expose `navigator.storage.estimate()` which returns
 * `{ usage, quota }` in bytes for the current origin. We wrap it in a
 * predictable shape that includes a percentage and a `supported` flag so
 * the History/Review banners can degrade gracefully on older browsers.
 *
 * The 80%-full threshold is a non-blocking warning per the slice spec —
 * we still allow the save to go through, but surface a banner suggesting
 * the user export + clear before the next save.
 */

export const QUOTA_WARNING_THRESHOLD_PCT = 80;

export interface QuotaStatus {
  /** Bytes currently used by this origin. */
  used: number;
  /** Bytes the browser is willing to grant this origin. */
  available: number;
  /** `used / available * 100`, rounded to 1 decimal. 0 when unsupported. */
  percentage: number;
  /** True iff `navigator.storage.estimate()` is callable. */
  supported: boolean;
}

export async function getQuotaStatus(): Promise<QuotaStatus> {
  const storage = (globalThis.navigator as Navigator | undefined)?.storage;
  if (!storage || typeof storage.estimate !== "function") {
    return { used: 0, available: 0, percentage: 0, supported: false };
  }
  const { usage, quota } = await storage.estimate();
  const used = usage ?? 0;
  const available = quota ?? 0;
  const percentage =
    available > 0 ? Math.round((used / available) * 1000) / 10 : 0;
  return { used, available, percentage, supported: true };
}

export function isQuotaWarning(status: QuotaStatus): boolean {
  return status.supported && status.percentage >= QUOTA_WARNING_THRESHOLD_PCT;
}
