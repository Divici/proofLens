import { expect, test } from "@playwright/test";

/**
 * End-to-end coverage of the slice 0003 verification pipeline.
 *
 * Scenarios:
 *   - 01 (spirits-pass) — overall Pass with no field-level fails.
 *   - 03 (abv-mismatch) — overall Fail with the ABV row in Fail state.
 *   - 04 (gov-warn-lowercase) — overall Fail with the governmentWarning
 *     row in Fail state and a bbox highlight on the warning paragraph.
 *
 * The /api/extract-label call is route-stubbed at the network boundary
 * so the e2e doesn't depend on OpenRouter / Tesseract.
 */

const COMMON_BBOX = {
  x0: 100,
  y0: 800,
  x1: 420,
  y1: 830,
  imageWidth: 1024,
  imageHeight: 1280,
};

function buildResponse({
  scenarioId,
  overall,
  abvStatus,
  govStatus,
  abvFound,
  abvExpected,
}: {
  scenarioId: string;
  overall: "pass" | "fail" | "pass-with-warnings";
  abvStatus: "pass" | "fail";
  govStatus: "pass" | "fail";
  abvFound: string;
  abvExpected: number;
}) {
  const fieldResults = [
    {
      field: "brand",
      label: "Brand name",
      status: "pass",
      value: "Brand X",
      expected: "Brand X",
      confidence: 0.95,
      explanation: "Value matches the expected entry exactly.",
      suggestedAction: "No action needed.",
      evidenceQuote: "BRAND X",
      bbox: COMMON_BBOX,
      outcomes: [],
    },
    {
      field: "abv",
      label: "Alcohol content (ABV)",
      status: abvStatus,
      value: abvFound,
      expected: abvExpected,
      confidence: 0.93,
      explanation:
        abvStatus === "pass"
          ? "Alcohol content matches expected within tolerance."
          : `Expected ${abvExpected}% ABV; found ${abvFound} (outside spirits ±0.3 pp tolerance).`,
      suggestedAction:
        abvStatus === "pass" ? "No action needed." : "Reject application or request a corrected label.",
      evidenceQuote: abvFound,
      bbox: COMMON_BBOX,
      outcomes: [],
    },
    {
      field: "governmentWarning",
      label: "Government warning",
      status: govStatus,
      value: "warning text",
      expected: "warning text",
      confidence: 0.94,
      explanation:
        govStatus === "pass"
          ? "Government warning text matches 27 CFR § 16.21 verbatim."
          : "The required prefix “GOVERNMENT WARNING:” must appear in all capital letters with a colon. Found a non-uppercase variant.",
      suggestedAction:
        govStatus === "pass" ? "No action needed." : "Reject application or request a corrected label.",
      evidenceQuote: "GOVERNMENT WARNING:",
      bbox: COMMON_BBOX,
      outcomes: [],
    },
  ];

  return {
    extracted: {
      brand: { value: "Brand X", evidenceQuote: "BRAND X", confidence: 0.95 },
      classType: { value: "Vodka", evidenceQuote: "VODKA", confidence: 0.91 },
      alcoholContentText: {
        value: abvFound,
        evidenceQuote: abvFound,
        confidence: 0.93,
      },
      abvPercent: { value: 38, evidenceQuote: "38%", confidence: 0.93 },
      proof: { value: 76, evidenceQuote: "(76 Proof)", confidence: 0.9 },
      netContents: { value: "750 mL", evidenceQuote: "750 mL", confidence: 0.95 },
      bottlerName: {
        value: "X Co.",
        evidenceQuote: "BOTTLED BY X CO.",
        confidence: 0.88,
      },
      bottlerAddress: { value: "Iowa", evidenceQuote: "IOWA", confidence: 0.85 },
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
      brand: "Brand X",
      classType: "Vodka",
      abv: abvExpected,
      netContents: "750 mL",
      bottlerName: "X Co.",
      bottlerAddress: "Iowa",
      countryOfOrigin: "United States",
      govWarningRequired: true,
      applicationNotes: scenarioId,
      beverageType: "distilled-spirits",
    },
    rawText: "ANYTHING",
    fieldResults,
    overall,
    processingTimeMs: 2400,
    aiSpend: { primaryUsd: 0.0042 },
    ocrConfidence: 0.92,
    imageWidth: 1024,
    imageHeight: 1280,
  };
}

test.describe("verification pipeline e2e", () => {
  test("scenario 01 — happy-path Pass", async ({ page }) => {
    await page.route("**/api/extract-label", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildResponse({
            scenarioId: "01-spirits-pass",
            overall: "pass",
            abvStatus: "pass",
            govStatus: "pass",
            abvFound: "45%",
            abvExpected: 45,
          }),
        ),
      });
    });

    await page.goto("/review");
    await page.getByRole("button", { name: /load demo image/i }).click();
    await page.getByRole("button", { name: /load demo data/i }).click();
    await page.getByRole("button", { name: /verify label/i }).click();

    await expect(page.getByLabel(/overall:\s*pass/i)).toBeVisible();
  });

  test("scenario 03 — ABV mismatch yields strict Fail", async ({ page }) => {
    await page.route("**/api/extract-label", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildResponse({
            scenarioId: "03-abv-mismatch",
            overall: "fail",
            abvStatus: "fail",
            govStatus: "pass",
            abvFound: "38% Alc./Vol.",
            abvExpected: 40,
          }),
        ),
      });
    });

    await page.goto("/review");
    // Pick scenario 03 from the demo dropdown.
    await page.locator("#demo-scenario").selectOption("03-abv-mismatch");
    await page.getByRole("button", { name: /load demo image/i }).click();
    await page.getByRole("button", { name: /load demo data/i }).click();
    await page.getByRole("button", { name: /verify label/i }).click();

    await expect(page.getByLabel(/overall:\s*fail/i)).toBeVisible();
    // ABV row shows Fail badge.
    const abvRow = page.getByRole("button", { name: /alcohol content/i });
    await expect(abvRow).toBeVisible();
    await expect(abvRow.getByText(/^fail$/i)).toBeVisible();
  });

  test("scenario 04 — gov-warning capitalization yields strict Fail with bbox", async ({
    page,
  }) => {
    await page.route("**/api/extract-label", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildResponse({
            scenarioId: "04-gov-warn-lowercase",
            overall: "fail",
            abvStatus: "pass",
            govStatus: "fail",
            abvFound: "47% Alc./Vol.",
            abvExpected: 47,
          }),
        ),
      });
    });

    await page.goto("/review");
    await page.locator("#demo-scenario").selectOption("04-gov-warn-lowercase");
    await page.getByRole("button", { name: /load demo image/i }).click();
    await page.getByRole("button", { name: /load demo data/i }).click();
    await page.getByRole("button", { name: /verify label/i }).click();

    await expect(page.getByLabel(/overall:\s*fail/i)).toBeVisible();

    // Click the gov-warning row → bbox polygon appears on the preview.
    const govRow = page.getByRole("button", { name: /government warning/i });
    await govRow.click();

    await expect(page.locator("[data-testid='bbox-polygon']")).toBeVisible();
  });
});
