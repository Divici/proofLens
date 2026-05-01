/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BatchDetailModal } from "./BatchDetailModal";
import type { BatchQueueItem } from "./BatchQueue";

const expected = {
  brand: "Old Tom",
  classType: "Bourbon",
  abv: 45,
  netContents: "750 mL",
  bottlerName: "Old Tom Distillery",
  bottlerAddress: "Bardstown, KY",
  countryOfOrigin: "United States",
  govWarningRequired: true,
  applicationNotes: "",
  beverageType: "distilled-spirits" as const,
};

const completedItem: BatchQueueItem = {
  id: "1",
  filename: "a.jpg",
  brand: "Old Tom",
  beverageType: "distilled-spirits",
  status: "complete",
  overall: "pass",
  errorMessage: null,
  processingTimeMs: 1200,
  hasFailures: false,
  hasOverrides: false,
  expected,
  response: {
    extracted: {
      brand: { value: "Old Tom", evidenceQuote: "OLD TOM", confidence: 0.95 },
      classType: { value: "Bourbon", evidenceQuote: "BOURBON", confidence: 0.9 },
      alcoholContentText: { value: "45%", evidenceQuote: "45%", confidence: 0.92 },
      abvPercent: { value: 45, evidenceQuote: "45%", confidence: 0.92 },
      proof: { value: 90, evidenceQuote: "90", confidence: 0.9 },
      netContents: { value: "750 mL", evidenceQuote: "750 mL", confidence: 0.95 },
      bottlerName: {
        value: "Old Tom Distillery",
        evidenceQuote: "OLD TOM DISTILLERY",
        confidence: 0.88,
      },
      bottlerAddress: { value: "Bardstown, KY", evidenceQuote: "BARDSTOWN", confidence: 0.85 },
      countryOfOrigin: { value: "United States", evidenceQuote: "U.S.A.", confidence: 0.9 },
      governmentWarningText: { value: "warn", evidenceQuote: "GOV", confidence: 0.93 },
      rawText: "RAW",
      imageQualityNotes: [],
      extractionConfidence: 0.92,
    },
    expected,
    rawText: "RAW",
    fieldResults: [
      {
        field: "brand",
        label: "Brand",
        status: "pass",
        value: "Old Tom",
        expected: "Old Tom",
        confidence: 0.95,
        explanation: "matches",
        suggestedAction: "none",
        evidenceQuote: "OLD TOM",
        bbox: null,
        outcomes: [],
      },
    ],
    overall: "pass",
    processingTimeMs: 1200,
    aiSpend: { primaryUsd: 0.005, fallbackUsd: 0 },
    ocrConfidence: 0.92,
    imageWidth: 200,
    imageHeight: 300,
    imageQualityFlags: [],
    imageQualityPoor: false,
  },
};

describe("BatchDetailModal", () => {
  it("renders nothing when item is null", () => {
    const { container } = render(
      <BatchDetailModal item={null} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the verification detail for a completed item", () => {
    render(<BatchDetailModal item={completedItem} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByText(/old tom/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/brand/i).length).toBeGreaterThan(0);
  });

  it("invokes onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<BatchDetailModal item={completedItem} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a batch-context image fallback message instead of 'No image uploaded yet.'", () => {
    render(<BatchDetailModal item={completedItem} onClose={() => {}} />);
    expect(
      screen.getByText(/image not retained for batch view/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no image uploaded yet/i)).not.toBeInTheDocument();
  });

  it("falls back to a placeholder for incomplete items", () => {
    const queued = { ...completedItem, status: "queued" as const, response: null };
    render(<BatchDetailModal item={queued} onClose={() => {}} />);
    expect(
      screen.getAllByText(
        (_text, node) =>
          node?.textContent?.toLowerCase().includes("isn't finished yet") ?? false,
      ).length,
    ).toBeGreaterThan(0);
  });
});
