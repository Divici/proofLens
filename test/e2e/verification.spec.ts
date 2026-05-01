import { expect, test } from "@playwright/test";

/**
 * End-to-end coverage of the verification pipeline (slices 0003-0004).
 *
 * Scenarios:
 *   - 01 (spirits-pass) — overall Pass with no field-level fails.
 *   - 02 (stones-throw) — overall Pass-with-Warnings; brand row is a
 *     Likely Match because the application uses mixed case while the
 *     label is all-caps. (Slice 0004)
 *   - 03 (abv-mismatch) — overall Fail with the ABV row in Fail state.
 *   - 04 (gov-warn-lowercase) — overall Fail with the governmentWarning
 *     row in Fail state and a bbox highlight on the warning paragraph.
 *   - 05 (warn-incomplete) — overall Fail (gov-warning truncated). (Slice 0004)
 *   - 06 (glare-blur) — overall Manual Review; quality banner visible
 *     and brand row demoted to Manual Review with the Request Better
 *     Image action. (Slice 0004)
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
    aiSpend: { primaryUsd: 0.0042, fallbackUsd: 0 },
    ocrConfidence: 0.92,
    imageWidth: 1024,
    imageHeight: 1280,
    imageQualityFlags: [],
    imageQualityPoor: false,
  };
}

/**
 * Variant of `buildResponse` for slice 0004 scenarios with extra knobs:
 * image-quality flags, beverage-type override, and a custom brand+expected
 * pair so the nuanced ladder demo (Stone's Throw vs STONE'S THROW) and
 * the incomplete-warning demo can drive the right field-row UX.
 */
function buildSliceFourResponse({
  scenarioId,
  overall,
  brandValue,
  brandExpected,
  brandStatus,
  govStatus,
  imageQualityFlags = [],
  imageQualityPoor = false,
  beverageType = "distilled-spirits",
}: {
  scenarioId: string;
  overall: "pass-with-warnings" | "fail" | "needs-manual-review" | "pass";
  brandValue: string;
  brandExpected: string;
  brandStatus: "pass" | "likely-match" | "manual-review";
  govStatus: "pass" | "fail" | "manual-review";
  imageQualityFlags?: string[];
  imageQualityPoor?: boolean;
  beverageType?: string;
}) {
  const fieldResults = [
    {
      field: "brand",
      label: "Brand name",
      status: brandStatus,
      value: brandValue,
      expected: brandExpected,
      confidence: 0.95,
      explanation:
        brandStatus === "pass"
          ? "Value matches the expected entry exactly."
          : brandStatus === "likely-match"
            ? "Value matches after case + punctuation normalisation (similarity 100%)."
            : "Image quality is too low for confident verification.",
      suggestedAction:
        brandStatus === "manual-review"
          ? "Request Better Image — image quality is too low for confident verification."
          : "No action needed.",
      evidenceQuote: brandValue,
      bbox: COMMON_BBOX,
      outcomes: [],
    },
    {
      field: "governmentWarning",
      label: "Government warning",
      status: govStatus,
      value: "warning text",
      expected: "27 CFR § 16.21 verbatim text",
      confidence: 0.94,
      explanation:
        govStatus === "pass"
          ? "Government warning text matches 27 CFR § 16.21 verbatim."
          : govStatus === "fail"
            ? "Warning text differs from the canonical 27 CFR § 16.21 statement."
            : "Manual review required — see the explanation for context.",
      suggestedAction:
        govStatus === "fail"
          ? "Reject the application or request a corrected label."
          : "No action needed.",
      evidenceQuote: "GOVERNMENT WARNING:",
      bbox: COMMON_BBOX,
      outcomes: [],
    },
  ];

  return {
    extracted: {
      brand: { value: brandValue, evidenceQuote: brandValue, confidence: 0.95 },
      classType: { value: "X", evidenceQuote: "X", confidence: 0.91 },
      alcoholContentText: { value: "5.2%", evidenceQuote: "5.2%", confidence: 0.93 },
      abvPercent: { value: 5.2, evidenceQuote: "5.2%", confidence: 0.93 },
      proof: { value: null, evidenceQuote: null, confidence: 0.5 },
      netContents: { value: "12 fl oz", evidenceQuote: "12 fl oz", confidence: 0.95 },
      bottlerName: { value: "X Co.", evidenceQuote: "X Co.", confidence: 0.88 },
      bottlerAddress: { value: "Bend, OR", evidenceQuote: "Bend, OR", confidence: 0.85 },
      countryOfOrigin: { value: "United States", evidenceQuote: "U.S.A.", confidence: 0.87 },
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
      brand: brandExpected,
      classType: "X",
      abv: 5.2,
      netContents: "12 fl oz",
      bottlerName: "X Co.",
      bottlerAddress: "Bend, OR",
      countryOfOrigin: "United States",
      govWarningRequired: true,
      applicationNotes: scenarioId,
      beverageType,
    },
    rawText: "ANYTHING",
    fieldResults,
    overall,
    processingTimeMs: 2400,
    aiSpend: { primaryUsd: 0.0042, fallbackUsd: 0 },
    ocrConfidence: 0.92,
    imageWidth: 1024,
    imageHeight: 1280,
    imageQualityFlags,
    imageQualityPoor,
  };
}

test.describe("verification pipeline e2e", () => {
  // Per-test IndexedDB cleanup so saved-review state from one test cannot
  // contaminate the next under fullyParallel + reuseExistingServer. This
  // mirrors the cleanup in override-and-history.spec.ts and export.spec.ts.
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

  test("scenario 02 — Stone's Throw nuanced brand match yields Pass with Warnings (slice 0004)", async ({
    page,
  }) => {
    await page.route("**/api/extract-label", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildSliceFourResponse({
            scenarioId: "02-stones-throw-caps",
            overall: "pass-with-warnings",
            brandValue: "STONE'S THROW",
            brandExpected: "Stone's Throw",
            brandStatus: "likely-match",
            govStatus: "pass",
            beverageType: "malt-beverage",
          }),
        ),
      });
    });

    await page.goto("/review");
    await page
      .locator("#demo-scenario")
      .selectOption("02-stones-throw-caps");
    await page.getByRole("button", { name: /load demo image/i }).click();
    await page.getByRole("button", { name: /load demo data/i }).click();
    await page.getByRole("button", { name: /verify label/i }).click();

    await expect(
      page.getByLabel(/overall:\s*pass with warnings/i),
    ).toBeVisible();
    const brandRow = page.getByRole("button", { name: /brand name/i });
    await expect(brandRow.getByText(/likely match/i)).toBeVisible();
  });

  test("scenario 05 — incomplete government warning yields strict Fail (slice 0004)", async ({
    page,
  }) => {
    await page.route("**/api/extract-label", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildSliceFourResponse({
            scenarioId: "05-warn-incomplete",
            overall: "fail",
            brandValue: "Riverfront Vineyards",
            brandExpected: "Riverfront Vineyards",
            brandStatus: "pass",
            govStatus: "fail",
            beverageType: "wine",
          }),
        ),
      });
    });

    await page.goto("/review");
    await page.locator("#demo-scenario").selectOption("05-warn-incomplete");
    await page.getByRole("button", { name: /load demo image/i }).click();
    await page.getByRole("button", { name: /load demo data/i }).click();
    await page.getByRole("button", { name: /verify label/i }).click();

    await expect(page.getByLabel(/overall:\s*fail/i)).toBeVisible();
    const govRow = page.getByRole("button", {
      name: /government warning/i,
    });
    await expect(govRow.getByText(/^fail$/i)).toBeVisible();
  });

  test("scenario 06 — glare/blur image triggers Manual Review with quality banner (slice 0004 R-011)", async ({
    page,
  }) => {
    await page.route("**/api/extract-label", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildSliceFourResponse({
            scenarioId: "06-glare-blur",
            overall: "needs-manual-review",
            brandValue: "Old Tom Distillery",
            brandExpected: "Old Tom Distillery",
            brandStatus: "manual-review",
            govStatus: "manual-review",
            imageQualityFlags: ["blur", "glare"],
            imageQualityPoor: true,
            beverageType: "distilled-spirits",
          }),
        ),
      });
    });

    await page.goto("/review");
    await page.locator("#demo-scenario").selectOption("06-glare-blur");
    await page.getByRole("button", { name: /load demo image/i }).click();
    await page.getByRole("button", { name: /load demo data/i }).click();
    await page.getByRole("button", { name: /verify label/i }).click();

    await expect(
      page.getByLabel(/overall:\s*needs manual review/i),
    ).toBeVisible();

    // Quality banner is visible and lists the flags.
    const banner = page.getByRole("alert", { name: /image quality/i });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/blur/i);
    await expect(banner).toContainText(/glare/i);
    await expect(banner).toContainText(/request better image/i);
  });
});
