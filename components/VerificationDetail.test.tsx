import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerificationDetail } from "./VerificationDetail";
import type { FieldResult } from "@/lib/verify/types";

const FIELDS: FieldResult[] = [
  {
    field: "brand",
    label: "Brand name",
    status: "pass",
    value: "Old Tom Distillery",
    expected: "Old Tom Distillery",
    confidence: 0.96,
    explanation: "Value matches exactly.",
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
    status: "fail",
    value: "40% Alc./Vol.",
    expected: 45,
    confidence: 0.93,
    explanation: "Expected 45% ABV; found 40%.",
    suggestedAction: "Reject application.",
    evidenceQuote: "40% Alc./Vol.",
    bbox: null,
    outcomes: [],
  },
];

describe("VerificationDetail", () => {
  it("renders the overall verdict panel", () => {
    render(
      <VerificationDetail
        imageSrc="/img.jpg"
        fieldResults={FIELDS}
        overall="fail"
        processingTimeMs={2400}
        primaryUsd={0.0042}
        ocrConfidence={0.92}
      />,
    );
    // The verdict pill exposes an aria-label "Overall: Fail" — use that
    // for the deterministic match, since "Fail" also appears as a
    // per-field badge.
    expect(
      screen.getByLabelText(/overall:\s*fail/i),
    ).toBeInTheDocument();
  });

  it("renders one row per field result", () => {
    render(
      <VerificationDetail
        imageSrc="/img.jpg"
        fieldResults={FIELDS}
        overall="fail"
        processingTimeMs={2400}
        primaryUsd={0.0042}
        ocrConfidence={0.92}
      />,
    );
    expect(screen.getByText(/brand name/i)).toBeInTheDocument();
    expect(screen.getByText(/alcohol content/i)).toBeInTheDocument();
  });

  it("clicking a field row updates the bbox highlight on the image", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <VerificationDetail
        imageSrc="/img.jpg"
        fieldResults={FIELDS}
        overall="fail"
        processingTimeMs={2400}
        primaryUsd={0.0042}
        ocrConfidence={0.92}
      />,
    );

    // No bbox initially.
    expect(container.querySelector("[data-testid='bbox-polygon']")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: /brand name/i }),
    );

    // Bbox now drawn for brand row.
    expect(
      container.querySelector("[data-testid='bbox-polygon']"),
    ).not.toBeNull();
  });

  it("clicking a row whose bbox is null doesn't crash and clears the overlay", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <VerificationDetail
        imageSrc="/img.jpg"
        fieldResults={FIELDS}
        overall="fail"
        processingTimeMs={2400}
        primaryUsd={0.0042}
        ocrConfidence={0.92}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /brand name/i }),
    );
    expect(
      container.querySelector("[data-testid='bbox-polygon']"),
    ).not.toBeNull();

    await user.click(
      screen.getByRole("button", { name: /alcohol content/i }),
    );
    expect(
      container.querySelector("[data-testid='bbox-polygon']"),
    ).toBeNull();
  });

  it("renders telemetry (latency + AI spend + OCR confidence)", () => {
    render(
      <VerificationDetail
        imageSrc="/img.jpg"
        fieldResults={FIELDS}
        overall="pass"
        processingTimeMs={2400}
        primaryUsd={0.0042}
        ocrConfidence={0.92}
      />,
    );
    expect(screen.getByText(/2\.4\s*s/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.0042/)).toBeInTheDocument();
    expect(screen.getByText(/92%/)).toBeInTheDocument();
  });
});
