import { expect, test } from "@playwright/test";

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
  imageQualityNotes: ["Slight glare in the upper-left corner"],
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
    bbox: {
      x0: 100,
      y0: 100,
      x1: 360,
      y1: 130,
      imageWidth: 1024,
      imageHeight: 1280,
    },
    outcomes: [],
  },
  {
    field: "abv",
    label: "Alcohol content (ABV)",
    status: "pass",
    value: "45% Alc./Vol.",
    expected: 45,
    confidence: 0.93,
    explanation: "Alcohol content 45% matches the expected 45% within tolerance.",
    suggestedAction: "No action needed.",
    evidenceQuote: "45% Alc./Vol. (90 Proof)",
    bbox: null,
    outcomes: [],
  },
  {
    field: "governmentWarning",
    label: "Government warning",
    status: "pass",
    value: "GOVERNMENT WARNING: ...",
    expected: "GOVERNMENT WARNING: ...",
    confidence: 0.94,
    explanation: "Government warning text matches 27 CFR § 16.21 verbatim.",
    suggestedAction: "No action needed.",
    evidenceQuote: "GOVERNMENT WARNING: ...",
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
  rawText:
    "OLD TOM DISTILLERY\nGOVERNMENT WARNING: (1) According to the Surgeon General",
  fieldResults: FIELD_RESULTS,
  overall: "pass",
  processingTimeMs: 2400,
  aiSpend: { primaryUsd: 0.0042, fallbackUsd: 0 },
  ocrConfidence: 0.92,
  imageWidth: 1024,
  imageHeight: 1280,
};

test.describe("single-label review flow", () => {
  test("loads demo data, submits, and shows verification detail screen", async ({
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

    await page.getByRole("button", { name: /load demo image/i }).click();
    await expect(
      page.getByRole("img", { name: /uploaded label preview/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /load demo data/i }).click();
    await expect(page.getByLabel(/brand name/i).first()).toHaveValue(
      "Old Tom Distillery",
    );

    await page.getByRole("button", { name: /verify label/i }).click();

    // Verification detail panel renders.
    await expect(page.getByText("Verification result")).toBeVisible();
    await expect(page.getByLabel(/overall:\s*pass/i)).toBeVisible();
    await expect(page.getByText(/2\.4\s*s/)).toBeVisible();
    await expect(page.getByText(/\$0\.0042/)).toBeVisible();
    await expect(page.getByText(/92%/)).toBeVisible();
  });
});
