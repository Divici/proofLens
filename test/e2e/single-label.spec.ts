import { expect, test } from "@playwright/test";

const EXTRACTED_FIXTURE = {
  brand: {
    value: "OLD TOM DISTILLERY",
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
  rawText: null,
  imageQualityNotes: ["Slight glare in the upper-left corner"],
  extractionConfidence: 0.91,
};

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
  processingTimeMs: 2400,
  aiSpend: { primaryUsd: 0.0042 },
};

test.describe("single-label review flow", () => {
  test("loads demo data, submits, and shows extracted fields", async ({
    page,
  }) => {
    // Mock the server endpoint at the API boundary so we don't hit
    // OpenRouter from CI. Vitest exercises the real handler separately.
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

    // Load the demo image (fetched from /demo-labels/01-spirits-pass.jpg).
    await page.getByRole("button", { name: /load demo image/i }).click();
    await expect(
      page.getByRole("img", { name: /uploaded label preview/i }),
    ).toBeVisible();

    // Load the demo expected-data into the form.
    await page.getByRole("button", { name: /load demo data/i }).click();
    await expect(page.getByLabel(/brand name/i)).toHaveValue(
      "Old Tom Distillery",
    );

    // Submit the form.
    await page.getByRole("button", { name: /verify label/i }).click();

    // Extracted card appears.
    await expect(page.getByText("Extracted label data")).toBeVisible();
    await expect(
      page.getByText("OLD TOM DISTILLERY").first(),
    ).toBeVisible();
    await expect(page.getByText(/2\.4\s*s/)).toBeVisible();
    await expect(page.getByText(/\$0\.0042/)).toBeVisible();
  });
});
