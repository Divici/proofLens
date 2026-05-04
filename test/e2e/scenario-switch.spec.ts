import { expect, test } from "@playwright/test";

/**
 * Regression test for the user-reported scenario-switch staleness bug:
 *
 *   "Pick a scenario from queue → image+data update correctly →
 *   click Verify → everything switches to Old Tom Distillery."
 *
 * The fix is the React `key` on `ReviewPageInner` — when the URL's
 * `?scenario=` value changes, the inner component unmounts and
 * remounts with fresh state. This test exercises both the navigate-
 * then-verify path and the seed-state-on-A-then-switch-to-B path.
 *
 * Mocks `/api/extract-label` to echo whatever expected data was
 * POSTed (so the test can assert the page sent the right scenario's
 * data, not on a fixed response).
 */

function buildExtractResponse(expected: Record<string, unknown>) {
  return {
    extracted: {
      brand: {
        value: expected?.brand ?? "?",
        evidenceQuote: expected?.brand ?? "?",
        confidence: 0.95,
      },
      classType: {
        value: expected?.classType ?? "?",
        evidenceQuote: expected?.classType ?? "?",
        confidence: 0.92,
      },
      alcoholContentText: {
        value: `${expected?.abv ?? 0}% Alc./Vol.`,
        evidenceQuote: `${expected?.abv ?? 0}% Alc./Vol.`,
        confidence: 0.93,
      },
      abvPercent: {
        value: expected?.abv ?? 0,
        evidenceQuote: `${expected?.abv ?? 0}%`,
        confidence: 0.92,
      },
      proof: {
        value: (expected?.abv as number) * 2,
        evidenceQuote: `(${(expected?.abv as number) * 2} Proof)`,
        confidence: 0.9,
      },
      netContents: {
        value: expected?.netContents ?? "?",
        evidenceQuote: expected?.netContents ?? "?",
        confidence: 0.95,
      },
      bottlerName: {
        value: expected?.bottlerName ?? "?",
        evidenceQuote: expected?.bottlerName ?? "?",
        confidence: 0.88,
      },
      bottlerAddress: {
        value: expected?.bottlerAddress ?? "?",
        evidenceQuote: expected?.bottlerAddress ?? "?",
        confidence: 0.85,
      },
      countryOfOrigin: {
        value: expected?.countryOfOrigin ?? "?",
        evidenceQuote: expected?.countryOfOrigin ?? "?",
        confidence: 0.87,
      },
      governmentWarningText: {
        value: "GOVERNMENT WARNING: ...",
        evidenceQuote: "GOVERNMENT WARNING: ...",
        confidence: 0.94,
      },
      rawText: "",
      imageQualityNotes: [],
      extractionConfidence: 0.92,
    },
    expected,
    rawText: "",
    fieldResults: [
      {
        field: "brand",
        label: "Brand name",
        status: "pass",
        value: expected?.brand ?? "?",
        expected: expected?.brand ?? "?",
        confidence: 0.95,
        explanation: "Value matches.",
        suggestedAction: "No action needed.",
        evidenceQuote: expected?.brand ?? "?",
        bbox: null,
        outcomes: [{ kind: "nuanced_pass", detail: {} }],
      },
    ],
    overall: "pass",
    processingTimeMs: 1234,
    aiSpend: { primaryUsd: 0.001, fallbackUsd: 0 },
    ocrConfidence: 0.9,
    imageWidth: 1024,
    imageHeight: 1280,
    imageQualityFlags: [],
    imageQualityPoor: false,
    ocrSource: "llm-fallback",
  };
}

function parseExpectedFromMultipart(body: string): Record<string, unknown> | null {
  const match = body.match(/name="expected"[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/);
  if (!match || !match[1]) return null;
  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

test.describe("scenario-switch staleness regression (Phase-9 user report)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/queue");
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("prooflens");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    });

    await page.route("**/api/extract-label", async (route) => {
      const body = route.request().postDataBuffer()?.toString("utf-8") ?? "";
      const expected = parseExpectedFromMultipart(body) ?? {};
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildExtractResponse(expected)),
      });
    });
  });

  test("verify on scenario 03 (Cedar Ridge) does NOT show Old Tom on the Results tab", async ({
    page,
  }) => {
    await page.goto("/queue");
    await page.getByRole("link", { name: /APP-2026-0003/i }).click();
    await expect(page).toHaveURL(/scenario=03-abv-mismatch/);

    // Application data tab shows Cedar Ridge.
    await expect(page.getByText("Cedar Ridge Vodka").first()).toBeVisible();

    // Click Verify.
    await page.getByRole("button", { name: /verify label/i }).click();

    // After verify, the Results tab is active and the brand-row's
    // expected reads Cedar Ridge — NOT Old Tom Distillery.
    await expect(
      page.getByText(/expected:\s*cedar ridge vodka/i),
    ).toBeVisible();
    expect(await page.getByText(/old tom distillery/i).count()).toBe(0);
  });

  test("verify on scenario 01, then navigate to scenario 03 and verify again — no bleed", async ({
    page,
  }) => {
    // Seed scenario 01 with a successful verify.
    await page.goto("/queue");
    await page.getByRole("link", { name: /APP-2026-0001/i }).click();
    await expect(page).toHaveURL(/scenario=01-spirits-pass/);
    await expect(page.getByText("Old Tom Distillery").first()).toBeVisible();
    await page.getByRole("button", { name: /verify label/i }).click();
    await expect(page.getByText(/expected:\s*old tom/i)).toBeVisible();

    // Navigate back to /queue and pick scenario 03.
    await page.getByRole("link", { name: /^queue$/i }).click();
    await expect(page).toHaveURL(/\/queue$/);
    await page.getByRole("link", { name: /APP-2026-0003/i }).click();
    await expect(page).toHaveURL(/scenario=03-abv-mismatch/);

    // Even though we just had a successful verify on scenario 01,
    // the page must NOT show old-tom data on scenario 03's screen.
    await expect(page.getByText("Cedar Ridge Vodka").first()).toBeVisible();
    expect(await page.getByText(/old tom distillery/i).count()).toBe(0);

    // Click Verify on scenario 03.
    await page.getByRole("button", { name: /verify label/i }).click();

    // Post-verify: expected = Cedar Ridge, not Old Tom.
    await expect(
      page.getByText(/expected:\s*cedar ridge vodka/i),
    ).toBeVisible();
    expect(await page.getByText(/old tom distillery/i).count()).toBe(0);
  });
});
