import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewHistoryRow } from "./ReviewHistoryRow";
import type { Review } from "@/lib/storage/types";
import { CURRENT_RULES_VERSION } from "@/lib/storage/types";
import type { ApplicationData, ExtractedLabelData } from "@/lib/ai/schema";

function makeExpected(brand = "Old Tom Distillery"): ApplicationData {
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

function makeReview(overrides: Partial<Review> = {}): Review {
  const expected = overrides.expectedData ?? makeExpected();
  return {
    id: "rev-1",
    createdAt: "2026-04-29T12:00:00Z",
    reviewerName: "Jane Doe",
    beverageType: "spirits",
    rulesVersion: CURRENT_RULES_VERSION,
    expectedData: expected,
    extracted: makeExtracted(),
    fieldResults: [],
    overall: "pass",
    imageQualityFlags: [],
    thumbnail: new Blob(["t"], { type: "image/jpeg" }),
    bboxes: {},
    rawText: "",
    decision: undefined,
    processingTimeMs: 1000,
    aiSpend: { primaryUsd: 0.001, fallbackUsd: 0 },
    brand: expected.brand,
    hasOverrides: false,
    ...overrides,
  };
}

describe("ReviewHistoryRow", () => {
  it("renders brand, reviewer, and overall status", () => {
    render(<ReviewHistoryRow review={makeReview()} />);
    expect(screen.getByText("Old Tom Distillery")).toBeInTheDocument();
    expect(screen.getByText(/jane doe/i)).toBeInTheDocument();
    expect(screen.getAllByText(/pass/i).length).toBeGreaterThan(0);
  });

  it("renders the human-overridden indicator when hasOverrides=true", () => {
    render(<ReviewHistoryRow review={makeReview({ hasOverrides: true })} />);
    expect(screen.getByTestId("override-indicator")).toBeInTheDocument();
  });

  it("does not render the override indicator when hasOverrides=false", () => {
    render(<ReviewHistoryRow review={makeReview({ hasOverrides: false })} />);
    expect(screen.queryByTestId("override-indicator")).not.toBeInTheDocument();
  });

  it("links to /review?reviewId=<id> for reopen", () => {
    render(<ReviewHistoryRow review={makeReview({ id: "uuid-1" })} />);
    const link = screen.getByRole("link", { name: /reopen old tom distillery/i });
    expect(link).toHaveAttribute("href", "/review?reviewId=uuid-1");
  });

  it("renders the beverage label", () => {
    render(
      <ReviewHistoryRow review={makeReview({ beverageType: "wine" })} />,
    );
    expect(screen.getByText(/wine/i)).toBeInTheDocument();
  });
});
