import { expect, test } from "@playwright/test";

/**
 * Camera capture e2e — slice 0006.
 *
 * Chromium's `--use-fake-ui-for-media-stream` flag (configured globally
 * in `playwright.config.ts`) auto-grants the OS prompt and pipes a
 * synthetic colored frame as the video source. We additionally call
 * `grantPermissions(['camera'])` for belt-and-braces and to assert the
 * documented permission-grant API works for our app's origin.
 *
 * The test exercises the full state machine:
 *   click "Camera" → permissions prompt → "Allow camera" → live preview
 *   → "Capture" → captured-pending-review → "Submit" → verification
 *   result rendered against a stubbed /api/extract-label response.
 */

const EXTRACTED_FIXTURE = {
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
  netContents: {
    value: "750 mL",
    evidenceQuote: "750 mL",
    confidence: 0.95,
  },
  bottlerName: {
    value: "Old Tom Distillery, LLC",
    evidenceQuote: "BOTTLED BY OLD TOM DISTILLERY, LLC",
    confidence: 0.88,
  },
  bottlerAddress: {
    value: "Bardstown, KY",
    evidenceQuote: "BARDSTOWN, KENTUCKY",
    confidence: 0.85,
  },
  countryOfOrigin: {
    value: "United States",
    evidenceQuote: "PRODUCT OF U.S.A.",
    confidence: 0.87,
  },
  governmentWarningText: {
    value: "GOVERNMENT WARNING: ...",
    evidenceQuote: "GOVERNMENT WARNING: ...",
    confidence: 0.94,
  },
  rawText:
    "OLD TOM DISTILLERY\nKentucky Straight Bourbon Whiskey\n45% Alc./Vol.\n750 mL\n",
  imageQualityNotes: [],
  extractionConfidence: 0.91,
};

const FIELD_RESULTS = [
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
    bbox: null,
    outcomes: [],
  },
];

const SUCCESS_BODY = {
  extracted: EXTRACTED_FIXTURE,
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
  rawText: "OLD TOM DISTILLERY\nGOVERNMENT WARNING: ...",
  fieldResults: FIELD_RESULTS,
  overall: "pass",
  processingTimeMs: 1800,
  aiSpend: { primaryUsd: 0.0042, fallbackUsd: 0 },
  ocrConfidence: 0.92,
  imageWidth: 1568,
  imageHeight: 1045,
};

test.describe("camera capture flow", () => {
  // Per-test IndexedDB cleanup — see verification.spec.ts for rationale.
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

  test("captures a frame from the fake media stream and submits to extract-label", async ({
    page,
    context,
    baseURL,
  }) => {
    // Belt-and-braces: also grant via the CDP permission API for our app
    // origin, so the prompt path can't intercept us in any browser
    // version where the launch flag changes shape.
    await context.grantPermissions(["camera"], {
      origin: baseURL ?? undefined,
    });

    await page.route("**/api/extract-label", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SUCCESS_BODY),
      });
    });

    await page.goto("/review?source=camera");

    // The camera shell starts open in source=camera mode; accept the
    // permission prompt and wait for the capture button.
    await expect(
      page.getByRole("heading", { name: /capture from camera/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /allow camera/i }).click();

    const captureButton = page.getByRole("button", { name: /^capture$/i });
    await expect(captureButton).toBeVisible({ timeout: 15_000 });

    // Wait for the preview to start producing frames so videoWidth > 0
    // by the time we shutter — the capture path throws otherwise.
    await page.waitForFunction(
      () => {
        const v = document.querySelector(
          "video[aria-label='Live camera preview']",
        ) as HTMLVideoElement | null;
        return !!v && v.readyState >= 2 && v.videoWidth > 0;
      },
      undefined,
      { timeout: 15_000 },
    );

    await captureButton.click();

    const submitButton = page.getByRole("button", { name: /submit/i });
    await expect(submitButton).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /retake/i }),
    ).toBeVisible();

    // The captured-frame preview <img> replaces the live <video>.
    await expect(
      page.getByRole("img", { name: /captured frame preview/i }),
    ).toBeVisible();

    await submitButton.click();

    // After submit, the camera shell closes and the captured image
    // becomes the active label image for the standard review form.
    await expect(
      page.getByRole("heading", { name: /capture from camera/i }),
    ).toBeHidden();

    // Fill the expected-data form manually — clicking "Load demo
    // scenario" would overwrite the camera-captured image with the
    // demo's bundled placeholder. Typing a minimum-viable application
    // record is the closest stand-in for what a real reviewer does
    // after a camera capture.
    await page.getByLabel(/brand name/i).first().fill("Old Tom Distillery");
    await page
      .getByLabel(/class.*type/i)
      .first()
      .fill("Kentucky Straight Bourbon Whiskey");
    await page.getByLabel(/abv/i).first().fill("45");
    await page.getByLabel(/net contents/i).first().fill("750 mL");
    await page
      .getByLabel(/bottler.*name/i)
      .first()
      .fill("Old Tom Distillery, LLC");
    await page
      .getByLabel(/bottler.*address/i)
      .first()
      .fill("123 Bourbon Lane, Bardstown, KY 40004");
    await page.getByLabel(/country of origin/i).first().fill("United States");
    await page.getByRole("button", { name: /verify label/i }).click();

    await expect(page.getByText("Verification result")).toBeVisible();
    await expect(page.getByLabel(/overall:\s*pass/i)).toBeVisible();
  });
});
