import { expect, test } from "@playwright/test";

/**
 * Slice 0008 e2e — export menu downloads PDF / JSON / batch ZIP.
 *
 * Strategy: stub /api/extract-label to a deterministic passing response
 * so we can drive the page through "verify → save → export" reliably.
 * The render-pdf endpoint runs for real (server-side), and IndexedDB is
 * exercised end-to-end since Playwright runs in a real Chromium.
 */

const COMMON_BBOX = {
  x0: 100,
  y0: 800,
  x1: 420,
  y1: 830,
  imageWidth: 1024,
  imageHeight: 1280,
};

function buildPassingResponse() {
  return {
    extracted: {
      brand: {
        value: "Old Tom Distillery",
        evidenceQuote: "OLD TOM DISTILLERY",
        confidence: 0.96,
      },
      classType: { value: "Bourbon", evidenceQuote: "BOURBON", confidence: 0.91 },
      alcoholContentText: { value: "45%", evidenceQuote: "45%", confidence: 0.93 },
      abvPercent: { value: 45, evidenceQuote: "45%", confidence: 0.93 },
      proof: { value: 90, evidenceQuote: "90 Proof", confidence: 0.9 },
      netContents: { value: "750 mL", evidenceQuote: "750 mL", confidence: 0.95 },
      bottlerName: {
        value: "Old Tom Distillery, LLC",
        evidenceQuote: "OLD TOM DISTILLERY, LLC",
        confidence: 0.88,
      },
      bottlerAddress: {
        value: "Bardstown, KY",
        evidenceQuote: "BARDSTOWN, KY",
        confidence: 0.85,
      },
      countryOfOrigin: {
        value: "United States",
        evidenceQuote: "U.S.A.",
        confidence: 0.87,
      },
      governmentWarningText: {
        value: "warning text",
        evidenceQuote: "GOVERNMENT WARNING:",
        confidence: 0.94,
      },
      rawText: "ANYTHING",
      imageQualityNotes: [],
      extractionConfidence: 0.91,
    },
    expected: {
      brand: "Old Tom Distillery",
      classType: "Kentucky Straight Bourbon Whiskey",
      abv: 45,
      netContents: "750 mL",
      bottlerName: "Old Tom Distillery, LLC",
      bottlerAddress: "123 Bourbon Lane, Bardstown, KY 40004",
      countryOfOrigin: "United States",
      govWarningRequired: true,
      applicationNotes: "01-spirits-pass",
      beverageType: "distilled-spirits",
    },
    rawText: "ANYTHING",
    fieldResults: [
      {
        field: "brand",
        label: "Brand name",
        status: "pass",
        value: "Old Tom Distillery",
        expected: "Old Tom Distillery",
        confidence: 0.96,
        explanation: "Value matches the expected entry exactly.",
        suggestedAction: "No action needed.",
        evidenceQuote: "OLD TOM DISTILLERY",
        bbox: COMMON_BBOX,
        outcomes: [],
      },
      {
        field: "abv",
        label: "Alcohol content (ABV)",
        status: "pass",
        value: 45,
        expected: 45,
        confidence: 0.93,
        explanation: "Alcohol content matches expected within tolerance.",
        suggestedAction: "No action needed.",
        evidenceQuote: "45%",
        bbox: COMMON_BBOX,
        outcomes: [],
      },
    ],
    overall: "pass",
    processingTimeMs: 2400,
    aiSpend: { primaryUsd: 0.0042, fallbackUsd: 0 },
    ocrConfidence: 0.92,
    imageWidth: 1024,
    imageHeight: 1280,
    imageQualityFlags: [],
    imageQualityPoor: false,
  };
}

test.describe("slice 0008 — export menus", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/extract-label", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildPassingResponse()),
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

  test("single review: export PDF downloads a non-empty PDF file", async ({
    page,
  }) => {
    // Render-pdf is the slowest path — extend the per-test timeout so
    // the synchronous @react-pdf/renderer pipeline has room when the
    // dev server is also serving competing requests under fullyParallel.
    test.setTimeout(90_000);
    await page.goto("/review");
    await page
      .getByRole("button", { name: /load demo scenario/i })
      .click();
    await page
      .getByRole("img", { name: /uploaded label preview/i })
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: /verify label/i }).click();
    await expect(page.getByLabel(/overall:\s*pass/i)).toBeVisible();

    // Save the review so the export menu unlocks.
    await page.getByLabel(/your name/i).fill("Jane Doe");
    await page.getByRole("radio", { name: /approve/i }).click();
    await page.getByRole("button", { name: /save review/i }).click();
    await expect(
      page.getByText(/review saved to your browser history/i),
    ).toBeVisible();

    // Open the export menu and trigger PDF download.
    const exportTrigger = page.getByRole("button", { name: /^export$/i });
    await expect(exportTrigger).toBeVisible();

    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await exportTrigger.click();
    const pdfItem = page.getByRole("menuitem", { name: /^pdf/i });
    await pdfItem.waitFor({ state: "visible" });
    // Render-pdf is the slowest action — kick it via a JS click to avoid
    // any pointerdown vs. base-ui dismiss-flicker race.
    await pdfItem.click({ force: true });
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();
    if (!path) throw new Error("download missing");
    const fs = await import("node:fs/promises");
    const buf = await fs.readFile(path);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.slice(0, 5).toString("utf8")).toBe("%PDF-");
  });

  test("single review: export JSON downloads a non-empty JSON file", async ({
    page,
  }) => {
    await page.goto("/review");
    await page
      .getByRole("button", { name: /load demo scenario/i })
      .click();
    await page
      .getByRole("img", { name: /uploaded label preview/i })
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: /verify label/i }).click();
    await expect(page.getByLabel(/overall:\s*pass/i)).toBeVisible();

    await page.getByLabel(/your name/i).fill("Jane Doe");
    await page.getByRole("radio", { name: /approve/i }).click();
    await page.getByRole("button", { name: /save review/i }).click();
    await expect(
      page.getByText(/review saved to your browser history/i),
    ).toBeVisible();

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: /^export$/i }).click();
    const jsonItem = page.getByRole("menuitem", { name: /^json/i });
    await jsonItem.waitFor({ state: "visible" });
    await jsonItem.click({ force: true });
    const download = await downloadPromise;
    const path = await download.path();
    if (!path) throw new Error("download missing");
    const fs = await import("node:fs/promises");
    const buf = await fs.readFile(path);
    expect(buf.length).toBeGreaterThan(50);
    const parsed = JSON.parse(buf.toString("utf8"));
    expect(parsed.review.brand).toBe("Old Tom Distillery");
    expect(parsed.review.reviewerName).toBe("Jane Doe");
  });

  test("batch: All JSON (zip) downloads a ZIP with a per-review entry", async ({
    page,
  }) => {
    // Batch + zip + IDB persistence is also slower than 30s under
    // parallel load — give the test the same headroom as the PDF case.
    test.setTimeout(90_000);
    // Drive the batch page through the demo manifest so we get a saved
    // batch with N reviews.
    await page.goto("/batch");
    await page.getByLabel(/reviewer name/i).fill("Jane Doe");
    await page.getByRole("button", { name: /load demo batch/i }).click();
    await page.getByRole("button", { name: /^start batch$/i }).click();

    // Wait until the batch saves.
    await expect(page.getByText(/saved to history/i)).toBeVisible({
      timeout: 30_000,
    });

    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: /^export$/i }).click();
    const allJsonItem = page.getByRole("menuitem", { name: /all json/i });
    await allJsonItem.waitFor({ state: "visible" });
    await allJsonItem.click({ force: true });
    const download = await downloadPromise;
    const path = await download.path();
    if (!path) throw new Error("download missing");

    const fs = await import("node:fs/promises");
    const buf = await fs.readFile(path);
    // ZIP magic
    expect(buf.slice(0, 4).toString("binary")).toBe("PK\x03\x04");
    // The archive should at least contain "batch.json" name.
    expect(buf.toString("binary")).toContain("batch.json");
  });
});
