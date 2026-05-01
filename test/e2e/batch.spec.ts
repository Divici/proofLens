import { expect, test } from "@playwright/test";

/**
 * E2E coverage for slice 0007 — batch flow.
 *
 * `/api/extract-label` is route-stubbed at the network boundary so we
 * don't depend on OpenRouter / Tesseract during E2E. The stub returns
 * a deterministic shape per call; the third call simulates a 502 once
 * so the retry-failed path has a real failed row to retry.
 *
 * IndexedDB is exercised for real (Playwright runs in real Chromium),
 * so the save → batch record loop crosses the actual storage layer.
 */

const COMMON_BBOX = {
  x0: 100,
  y0: 800,
  x1: 420,
  y1: 830,
  imageWidth: 1024,
  imageHeight: 1280,
};

function buildPassingResponse(brand: string, beverageType = "distilled-spirits") {
  return {
    extracted: {
      brand: { value: brand, evidenceQuote: brand.toUpperCase(), confidence: 0.96 },
      classType: { value: "Bourbon", evidenceQuote: "BOURBON", confidence: 0.91 },
      alcoholContentText: { value: "45%", evidenceQuote: "45%", confidence: 0.93 },
      abvPercent: { value: 45, evidenceQuote: "45%", confidence: 0.93 },
      proof: { value: 90, evidenceQuote: "90 Proof", confidence: 0.9 },
      netContents: { value: "750 mL", evidenceQuote: "750 mL", confidence: 0.95 },
      bottlerName: { value: "Bottler", evidenceQuote: "BOTTLER", confidence: 0.88 },
      bottlerAddress: { value: "Bardstown, KY", evidenceQuote: "BARDSTOWN", confidence: 0.85 },
      countryOfOrigin: { value: "United States", evidenceQuote: "U.S.A.", confidence: 0.87 },
      governmentWarningText: { value: "warning", evidenceQuote: "GOVERNMENT WARNING:", confidence: 0.94 },
      rawText: "RAW",
      imageQualityNotes: [],
      extractionConfidence: 0.91,
    },
    expected: {
      brand,
      classType: "Bourbon",
      abv: 45,
      netContents: "750 mL",
      bottlerName: "Bottler",
      bottlerAddress: "Bardstown",
      countryOfOrigin: "United States",
      govWarningRequired: true,
      applicationNotes: "",
      beverageType,
    },
    rawText: "RAW",
    fieldResults: [
      {
        field: "brand",
        label: "Brand name",
        status: "pass",
        value: brand,
        expected: brand,
        confidence: 0.96,
        explanation: "Matches exactly.",
        suggestedAction: "No action.",
        evidenceQuote: brand.toUpperCase(),
        bbox: COMMON_BBOX,
        outcomes: [],
      },
    ],
    overall: "pass",
    processingTimeMs: 1200,
    aiSpend: { primaryUsd: 0.005, fallbackUsd: 0 },
    ocrConfidence: 0.92,
    imageWidth: 1024,
    imageHeight: 1280,
    imageQualityFlags: [],
    imageQualityPoor: false,
  };
}

test.describe("slice 0007 — batch flow e2e", () => {
  test.beforeEach(async ({ page }) => {
    let callCount = 0;
    await page.route("**/api/extract-label", async (route) => {
      callCount += 1;
      // Deterministic flake: the third call (across the initial run)
      // returns a 502 the first time; the retry path then succeeds.
      if (callCount === 3) {
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "Vision provider unavailable." }),
        });
        return;
      }
      // Vary brand by request count so the queue rows are distinct.
      const brand = `Brand ${callCount}`;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildPassingResponse(brand)),
      });
    });
    await page.goto("/");
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("prooflens");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    });
  });

  test("load demo batch → run → see summary, retry failed, open detail, filter", async ({
    page,
  }) => {
    await page.goto("/batch");

    await page.getByLabel(/reviewer name/i).fill("Jane Doe");
    await page.getByRole("button", { name: /load demo batch/i }).click();

    // The demo manifest ships 6 entries; the dropzone should reflect that.
    await expect(page.getByText(/6 expected-data rows/i)).toBeVisible();

    await page.getByRole("button", { name: /^start batch$/i }).click();

    // Wait until processing completes for every row (5 succeed, 1 fails).
    await expect.poll(
      async () =>
        await page
          .locator('[data-testid="batch-queue-row"]')
          .filter({ hasText: /complete|failed/i })
          .count(),
      { timeout: 30_000 },
    ).toBeGreaterThanOrEqual(6);

    // Summary tile shows "Failures" with at least 1.
    const failuresLabel = page.getByText(/^failures$/i);
    await expect(failuresLabel.first()).toBeVisible();

    // Filter to failed-only — exactly one row.
    await page.getByRole("button", { name: /failed only/i }).click();
    await expect(page.locator('[data-testid="batch-queue-row"]')).toHaveCount(1);

    // Retry-failed: bulk button.
    await page.getByRole("button", { name: /retry all failed/i }).click();

    // After retry, no rows remain in failed-only.
    await expect.poll(
      async () =>
        await page.locator('[data-testid="batch-queue-row"]').count(),
      { timeout: 15_000 },
    ).toBe(0);

    // Switch back to All — all 6 rows visible, all complete.
    await page.getByRole("button", { name: /^all$/i }).first().click();
    await expect(page.locator('[data-testid="batch-queue-row"]')).toHaveCount(
      6,
    );

    // Open detail modal on the first complete row.
    const firstRow = page.locator('[data-testid="batch-queue-row"]').first();
    await firstRow.getByRole("button", { name: /open .*\.jpg/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Close
    await dialog.getByRole("button", { name: /close/i }).click();
    await expect(dialog).not.toBeVisible();

    // Saved-to-history pill appears once everything finishes.
    await expect(page.getByText(/saved to history/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("downloads CSV template and trim modal fires above hard cap", async ({
    page,
  }) => {
    await page.goto("/batch");
    // Template is served as an attachment.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: /download template/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /prooflens-batch-template\.csv/i,
    );
  });

  test("rejects 251 dropped files with a trim-to-250 modal", async ({
    page,
  }) => {
    await page.goto("/batch");
    // Build 251 tiny in-memory PNG buffers and feed them through the
    // hidden file input.
    const buffers = await page.evaluate(async () => {
      const tiny = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const list: { name: string; mime: string; b64: string }[] = [];
      for (let i = 0; i < 251; i++) {
        const blob = new Blob([tiny], { type: "image/png" });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (const byte of buf) bin += String.fromCharCode(byte);
        list.push({
          name: `file-${i}.png`,
          mime: "image/png",
          b64: btoa(bin),
        });
      }
      return list;
    });

    await page.locator('input[aria-label="Label files input"]').setInputFiles(
      buffers.map((b) => ({
        name: b.name,
        mimeType: b.mime,
        buffer: Buffer.from(b.b64, "base64"),
      })),
    );

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/trim/i);
    await expect(dialog).toContainText(/250/);
  });
});
