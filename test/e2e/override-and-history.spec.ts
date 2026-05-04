import { expect, test } from "@playwright/test";

/**
 * End-to-end coverage for slice 0005: per-field human override + final
 * decision + IndexedDB save → History page → reopen.
 *
 * The /api/extract-label call is route-stubbed at the network boundary so
 * we don't depend on OpenRouter / Tesseract. IndexedDB is exercised for
 * real (Playwright runs in a real Chromium), so the save → list → reopen
 * loop crosses the actual storage layer.
 */

const COMMON_BBOX = {
  x0: 100,
  y0: 800,
  x1: 420,
  y1: 830,
  imageWidth: 1024,
  imageHeight: 1280,
};

function buildPassingResponse(scenarioId: string) {
  const fieldResults = [
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
      value: "45%",
      expected: 45,
      confidence: 0.93,
      explanation: "Alcohol content matches expected within tolerance.",
      suggestedAction: "No action needed.",
      evidenceQuote: "45%",
      bbox: COMMON_BBOX,
      outcomes: [],
    },
  ];
  return {
    extracted: {
      brand: { value: "Old Tom Distillery", evidenceQuote: "OLD TOM DISTILLERY", confidence: 0.96 },
      classType: { value: "Bourbon", evidenceQuote: "BOURBON", confidence: 0.91 },
      alcoholContentText: { value: "45%", evidenceQuote: "45%", confidence: 0.93 },
      abvPercent: { value: 45, evidenceQuote: "45%", confidence: 0.93 },
      proof: { value: 90, evidenceQuote: "90 Proof", confidence: 0.9 },
      netContents: { value: "750 mL", evidenceQuote: "750 mL", confidence: 0.95 },
      bottlerName: { value: "Old Tom Distillery, LLC", evidenceQuote: "OLD TOM DISTILLERY, LLC", confidence: 0.88 },
      bottlerAddress: { value: "Bardstown, KY", evidenceQuote: "BARDSTOWN, KY", confidence: 0.85 },
      countryOfOrigin: { value: "United States", evidenceQuote: "U.S.A.", confidence: 0.87 },
      governmentWarningText: { value: "warning text", evidenceQuote: "GOVERNMENT WARNING:", confidence: 0.94 },
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
      applicationNotes: scenarioId,
      beverageType: "distilled-spirits",
    },
    rawText: "ANYTHING",
    fieldResults,
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

test.describe("slice 0005 — override + history e2e", () => {
  test.beforeEach(async ({ page }) => {
    // Stub /api/extract-label deterministically and reset IndexedDB so each
    // run starts with a clean History list.
    await page.route("**/api/extract-label", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildPassingResponse("01-spirits-pass")),
      });
    });
    await page.goto("/");
    await page.evaluate(async () => {
      // Best-effort wipe of the proofLens db before each scenario.
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("prooflens");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    });
  });

  test("override a field, save with reviewer name, see it in history, reopen with state hydrated", async ({
    page,
  }) => {
    // 1. Run the verification.
    await page.goto("/review");
    await page
      .getByRole("button", { name: /load demo scenario/i })
      .click();
    await page
      .getByRole("img", { name: /uploaded label preview/i })
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: /verify label/i }).click();

    await expect(page.getByLabel(/overall:\s*pass/i)).toBeVisible();

    // 2. Expand the brand row, override Pass → Fail with a reason.
    const brandRow = page.getByRole("button", { name: /brand name/i });
    await brandRow.click();
    const overridePanel = page.getByTestId("human-override-panel");
    await expect(overridePanel).toBeVisible();

    // Reviewer name is required first — type it in the final-decision panel.
    await page.getByLabel(/your name/i).fill("Jane Doe");

    // Open the shadcn / base-ui Select popover and pick "Fail".
    await overridePanel
      .getByRole("combobox", { name: /new status/i })
      .click();
    await page
      .getByRole("listbox")
      .getByRole("option", { name: /^fail$/i })
      .click();
    await overridePanel
      .getByLabel(/reason for override/i)
      .fill("Brand colour was wrong; reviewer caught it.");
    await overridePanel
      .getByRole("button", { name: /save override/i })
      .click();

    // 3. Pick the Approved decision and save.
    await page.getByRole("radio", { name: /approve/i }).click();
    await page.getByRole("button", { name: /save review/i }).click();

    // Toast confirms the save.
    await expect(
      page.getByText(/review saved to your browser history/i),
    ).toBeVisible();

    // Manual / direct-upload flow stays on /review with the new
    // reviewId so the export menu (PDF / JSON) is reachable in-place.
    // Queue + reopen flows reroute back to /queue (covered separately).
    await expect(page).toHaveURL(/\/review\?reviewId=/);

    // 4. Navigate to history and verify the row is present with override badge.
    await page.getByRole("link", { name: /^history$/i }).click();
    await expect(page).toHaveURL(/\/history/);
    const historyRow = page.getByTestId("review-history-row").first();
    await expect(historyRow).toBeVisible();
    await expect(historyRow).toContainText(/old tom distillery/i);
    await expect(historyRow).toContainText(/jane doe/i);
    await expect(
      historyRow.getByTestId("override-indicator"),
    ).toBeVisible();

    // 5. Reopen the review.
    await historyRow.getByRole("link", { name: /reopen/i }).click();
    await expect(page).toHaveURL(/\/review\?reviewId=/);
    await expect(
      page.getByRole("heading", { name: /reopened review/i }),
    ).toBeVisible();
    // The override note is rendered on the brand row.
    await expect(
      page.getByText(/brand colour was wrong/i),
    ).toBeVisible();
    // Reviewer name pre-filled.
    await expect(page.getByLabel(/your name/i)).toHaveValue("Jane Doe");

    // Reopen contract — neither the application data nor the artwork
    // is editable, and the "Load demo scenario" affordance is hidden
    // (it belongs to the manual / direct-upload flow only).
    // Reopen lands on the Results tab by default; switch to
    // Application data to assert the read-only contract.
    await page
      .getByRole("tab", { name: /application data/i })
      .click();
    await expect(
      page.getByText(/on file with this application — read-only/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /load demo scenario/i }),
    ).toHaveCount(0);
    await expect(page.locator("#demo-scenario")).toHaveCount(0);
    // No file picker affordance on the artwork — neither the drag-drop
    // text nor a file input should be reachable.
    await expect(
      page.getByText(/drag (and )?drop|click to upload/i),
    ).toHaveCount(0);
  });

  test("save is disabled until reviewer name and decision are set", async ({
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

    const save = page.getByRole("button", { name: /save review/i });
    await expect(save).toBeDisabled();

    await page.getByLabel(/your name/i).fill("Jane Doe");
    // Still no decision picked
    await expect(save).toBeDisabled();

    await page.getByRole("radio", { name: /approve/i }).click();
    await expect(save).toBeEnabled();
  });

  test("history empty state appears when no reviews are saved", async ({
    page,
  }) => {
    await page.goto("/history");
    await expect(page.getByText(/no reviews yet/i)).toBeVisible();
  });

  test("queue flow → verify → save reroutes back to /queue (Sarah Chen 'next application' cadence)", async ({
    page,
  }) => {
    await page.goto("/queue");
    await page.getByRole("link", { name: /APP-2026-0001/i }).click();
    await expect(page).toHaveURL(/scenario=01-spirits-pass/);
    await page
      .getByRole("img", { name: /label artwork on file/i })
      .waitFor({ state: "visible" });

    await page.getByRole("button", { name: /verify label/i }).click();
    await expect(page.getByLabel(/overall:\s*pass/i)).toBeVisible();

    await page.getByLabel(/your name/i).fill("Jane Doe");
    await page.getByRole("radio", { name: /approve/i }).click();
    await page.getByRole("button", { name: /save review/i }).click();

    // Brief-matching cadence — agent saves, lands back in the queue
    // ready for the next application. The Reviewed pill on the row
    // they just finished is the visible signal that the save round-
    // tripped through IndexedDB.
    await expect(page).toHaveURL(/\/queue$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /pending applications/i }),
    ).toBeVisible();
  });
});
