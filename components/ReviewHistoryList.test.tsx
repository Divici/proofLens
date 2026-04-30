import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewHistoryList } from "./ReviewHistoryList";
import type { Review } from "@/lib/storage/types";
import { CURRENT_RULES_VERSION } from "@/lib/storage/types";
import type { ApplicationData, ExtractedLabelData } from "@/lib/ai/schema";

function makeExpected(brand: string): ApplicationData {
  return {
    brand,
    classType: "Bourbon",
    abv: 45,
    netContents: "750 mL",
    bottlerName: "X",
    bottlerAddress: "Y",
    countryOfOrigin: "United States",
    govWarningRequired: true,
    applicationNotes: "TEST",
    beverageType: "distilled-spirits",
  };
}

function makeExtracted(): ExtractedLabelData {
  const f = (v: string) => ({ value: v, evidenceQuote: v, confidence: 0.9 });
  return {
    brand: f("X"),
    classType: f("Bourbon"),
    alcoholContentText: f("45%"),
    abvPercent: { value: 45, evidenceQuote: "45%", confidence: 0.9 },
    proof: { value: 90, evidenceQuote: "90 Proof", confidence: 0.9 },
    netContents: f("750 mL"),
    bottlerName: f("X"),
    bottlerAddress: f("Y"),
    countryOfOrigin: f("United States"),
    governmentWarningText: f("GOVERNMENT WARNING:"),
    rawText: "ANY",
    imageQualityNotes: [],
    extractionConfidence: 0.9,
  };
}

function makeReview(
  i: number,
  overrides: Partial<Review> = {},
): Review {
  const expected = overrides.expectedData ?? makeExpected(`Brand ${i}`);
  return {
    id: `rev-${i}`,
    createdAt: `2026-04-${String(20 + i).padStart(2, "0")}T12:00:00Z`,
    reviewerName: i % 2 === 0 ? "Jane Doe" : "John Smith",
    beverageType: "spirits",
    rulesVersion: CURRENT_RULES_VERSION,
    expectedData: expected,
    extracted: makeExtracted(),
    fieldResults: [],
    overall: i % 3 === 0 ? "fail" : "pass",
    imageQualityFlags: [],
    thumbnail: new Blob(["t"], { type: "image/jpeg" }),
    bboxes: {},
    rawText: "",
    decision: undefined,
    processingTimeMs: 1000,
    aiSpend: { primaryUsd: 0.001, fallbackUsd: 0 },
    brand: expected.brand,
    hasOverrides: i === 1,
    ...overrides,
  };
}

describe("ReviewHistoryList", () => {
  it("renders the empty state when no reviews", () => {
    render(<ReviewHistoryList reviews={[]} />);
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
  });

  it("renders one row per review", () => {
    render(
      <ReviewHistoryList
        reviews={[makeReview(1), makeReview(2), makeReview(3)]}
      />,
    );
    expect(screen.getAllByTestId("review-history-row")).toHaveLength(3);
  });

  it("filters by brand search (case-insensitive)", async () => {
    const user = userEvent.setup();
    render(
      <ReviewHistoryList
        reviews={[
          makeReview(1, {
            brand: "Old Tom",
            expectedData: makeExpected("Old Tom"),
          }),
          makeReview(2, {
            brand: "Lakeside Gin",
            expectedData: makeExpected("Lakeside Gin"),
          }),
        ]}
      />,
    );
    const search = screen.getByLabelText(/search/i);
    await user.type(search, "lakeside");
    expect(screen.getAllByTestId("review-history-row")).toHaveLength(1);
    expect(screen.getByText("Lakeside Gin")).toBeInTheDocument();
  });

  it("filters by overall status", async () => {
    const user = userEvent.setup();
    render(
      <ReviewHistoryList
        reviews={[
          makeReview(1, { overall: "pass" }),
          makeReview(2, { overall: "fail" }),
        ]}
      />,
    );
    await user.selectOptions(
      screen.getByLabelText(/filter by status/i),
      "fail",
    );
    expect(screen.getAllByTestId("review-history-row")).toHaveLength(1);
  });

  it("filters by has-overrides", async () => {
    const user = userEvent.setup();
    render(
      <ReviewHistoryList
        reviews={[
          makeReview(1, { hasOverrides: true }),
          makeReview(2, { hasOverrides: false }),
        ]}
      />,
    );
    await user.click(screen.getByLabelText(/only with overrides/i));
    expect(screen.getAllByTestId("review-history-row")).toHaveLength(1);
  });

  it("filters by beverage type", async () => {
    const user = userEvent.setup();
    render(
      <ReviewHistoryList
        reviews={[
          makeReview(1, { beverageType: "spirits" }),
          makeReview(2, { beverageType: "wine" }),
        ]}
      />,
    );
    await user.selectOptions(
      screen.getByLabelText(/filter by beverage/i),
      "wine",
    );
    expect(screen.getAllByTestId("review-history-row")).toHaveLength(1);
  });

  it("shows a 'no matches' state when filters exclude everything", async () => {
    const user = userEvent.setup();
    render(<ReviewHistoryList reviews={[makeReview(1)]} />);
    const search = screen.getByLabelText(/search/i);
    await user.type(search, "zzz-no-match-zzz");
    expect(screen.getByText(/no reviews match/i)).toBeInTheDocument();
  });
});
