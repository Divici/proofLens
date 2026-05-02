import { expect, test } from "@playwright/test";

/**
 * Keyboard-only end-to-end (slice 0009 — R-018 a11y).
 *
 * Drives the full single-label happy-path flow with no mouse events:
 *   - skip-to-main link reachable from the very first Tab keystroke
 *   - demo image + demo data buttons activated via keyboard
 *   - form fields navigated and the "Verify label" submit button
 *     activated via Enter
 *   - verification result panel renders without any pointer interaction
 *
 * The /api/extract-label call is route-stubbed so we don't depend on
 * OpenRouter / Tesseract during the keyboard-only run.
 */

const COMMON_BBOX = {
  x0: 100,
  y0: 800,
  x1: 420,
  y1: 830,
  imageWidth: 1024,
  imageHeight: 1280,
};

const SUCCESS_BODY = {
  extracted: {
    brand: {
      value: "Old Tom Distillery",
      evidenceQuote: "OLD TOM DISTILLERY",
      confidence: 0.96,
    },
    classType: {
      value: "Kentucky Straight Bourbon Whiskey",
      evidenceQuote: "KENTUCKY STRAIGHT BOURBON WHISKEY",
      confidence: 0.91,
    },
    alcoholContentText: {
      value: "45% Alc./Vol.",
      evidenceQuote: "45% Alc./Vol. (90 Proof)",
      confidence: 0.93,
    },
    abvPercent: { value: 45, evidenceQuote: "45%", confidence: 0.92 },
    proof: { value: 90, evidenceQuote: "(90 Proof)", confidence: 0.9 },
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
    applicationNotes: "TTB-2026-00001",
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

test.describe("keyboard-only single-label flow (slice 0009)", () => {
  test.beforeEach(async ({ page }) => {
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

  test("Skip-to-main link is the first focusable element on the page", async ({
    page,
  }) => {
    await page.goto("/");
    // First Tab from a fresh page should land on the skip link.
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveText(/skip to main content/i);
    await expect(focused).toHaveAttribute("href", "#main");
  });

  test("Submits the full single-label flow via keyboard with no mouse events", async ({
    page,
  }) => {
    await page.route("**/api/extract-label", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SUCCESS_BODY),
      });
    });

    await page.goto("/review");
    await expect(
      page.getByRole("heading", { level: 1, name: /new review/i }),
    ).toBeVisible();

    // Activate the single "Load demo scenario" button via keyboard. It
    // loads BOTH the image AND the matching expected-data form values.
    const loadDemoScenario = page.getByRole("button", {
      name: /load demo scenario/i,
    });
    await loadDemoScenario.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("img", { name: /uploaded label preview/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/brand name/i).first()).toHaveValue(
      "Old Tom Distillery",
    );

    // "Verify label" submit via Enter.
    const verify = page.getByRole("button", { name: /verify label/i });
    await verify.focus();
    await page.keyboard.press("Enter");

    // Verification result panel renders.
    await expect(page.getByLabel(/overall:\s*pass/i)).toBeVisible();
  });
});
