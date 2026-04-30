import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExtractedDataCard } from "./ExtractedDataCard";
import type { ExtractedLabelData } from "@/lib/ai/schema";

const FIXTURE: ExtractedLabelData = {
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
  abvPercent: {
    value: 45,
    evidenceQuote: "45% Alc./Vol.",
    confidence: 0.92,
  },
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
    value: null,
    evidenceQuote: null,
    confidence: 0,
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

describe("ExtractedDataCard", () => {
  it("renders every documented field with its extracted value", () => {
    render(
      <ExtractedDataCard
        extracted={FIXTURE}
        processingTimeMs={2400}
        primaryUsd={0.0042}
      />,
    );

    expect(
      screen.getAllByText(/OLD TOM DISTILLERY/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText("Kentucky Straight Bourbon Whiskey"),
    ).toBeInTheDocument();
    expect(screen.getByText("750 mL")).toBeInTheDocument();
  });

  it("shows 'Not visible' for null fields", () => {
    render(
      <ExtractedDataCard
        extracted={FIXTURE}
        processingTimeMs={2400}
        primaryUsd={0.0042}
      />,
    );

    expect(screen.getAllByText(/not visible/i).length).toBeGreaterThan(0);
  });

  it("renders confidence as a percentage for each field", () => {
    render(
      <ExtractedDataCard
        extracted={FIXTURE}
        processingTimeMs={2400}
        primaryUsd={0.0042}
      />,
    );

    // Brand confidence: 0.96 -> 96%
    expect(screen.getByText(/96%/)).toBeInTheDocument();
  });

  it("renders evidence quotes when present", () => {
    render(
      <ExtractedDataCard
        extracted={FIXTURE}
        processingTimeMs={2400}
        primaryUsd={0.0042}
      />,
    );

    expect(
      screen.getByText(/BOTTLED BY OLD TOM DISTILLERY, LLC/),
    ).toBeInTheDocument();
  });

  it("renders processing time + AI spend telemetry", () => {
    render(
      <ExtractedDataCard
        extracted={FIXTURE}
        processingTimeMs={2400}
        primaryUsd={0.0042}
      />,
    );

    // Latency: 2400ms = 2.4s
    expect(screen.getByText(/2\.4\s*s/)).toBeInTheDocument();
    // Cost: $0.0042 (4 decimals visible somewhere)
    expect(screen.getByText(/\$0\.0042/)).toBeInTheDocument();
  });

  it("renders image-quality notes when present", () => {
    render(
      <ExtractedDataCard
        extracted={FIXTURE}
        processingTimeMs={2400}
        primaryUsd={0.0042}
      />,
    );

    expect(
      screen.getByText(/Slight glare in the upper-left corner/),
    ).toBeInTheDocument();
  });
});
