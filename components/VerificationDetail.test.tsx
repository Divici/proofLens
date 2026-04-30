import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerificationDetail } from "./VerificationDetail";
import type { FieldResult, OverallStatus } from "@/lib/verify/types";

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

  it.each<OverallStatus>([
    "pass",
    "pass-with-warnings",
    "fail",
    "needs-manual-review",
    "request-better-image",
  ])(
    "renders an icon alongside the overall pill label for status %s (R-018 a11y)",
    (status) => {
      const { unmount } = render(
        <VerificationDetail
          imageSrc="/img.jpg"
          fieldResults={FIELDS}
          overall={status}
          processingTimeMs={2400}
          primaryUsd={0.0042}
          ocrConfidence={0.92}
        />,
      );
      // The pill must always include an icon (color + icon + text — never
      // color-only). Per R-018 a11y, this is non-negotiable.
      const icon = screen.getByTestId("overall-status-icon");
      expect(icon).toBeInTheDocument();
      // Icon is decorative; the text label provides the accessible name.
      expect(icon).toHaveAttribute("aria-hidden", "true");
      unmount();
    },
  );

  it("renders the image-quality banner when flags are present (R-011)", () => {
    render(
      <VerificationDetail
        imageSrc="/img.jpg"
        fieldResults={FIELDS}
        overall="needs-manual-review"
        processingTimeMs={2400}
        primaryUsd={0.0042}
        ocrConfidence={0.92}
        imageQualityFlags={["blur", "glare"]}
      />,
    );
    const banner = screen.getByRole("alert", {
      name: /image quality/i,
    });
    expect(banner).toBeInTheDocument();
    expect(banner.textContent?.toLowerCase()).toContain("blur");
    expect(banner.textContent?.toLowerCase()).toContain("glare");
    expect(banner.textContent?.toLowerCase()).toContain("request better image");
  });

  it("does not render the image-quality banner when no flags are present", () => {
    render(
      <VerificationDetail
        imageSrc="/img.jpg"
        fieldResults={FIELDS}
        overall="pass"
        processingTimeMs={2400}
        primaryUsd={0.0042}
        ocrConfidence={0.92}
        imageQualityFlags={[]}
      />,
    );
    expect(
      screen.queryByRole("alert", { name: /image quality/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the unknown-beverage banner when beverageType is unknown", () => {
    render(
      <VerificationDetail
        imageSrc="/img.jpg"
        fieldResults={FIELDS}
        overall="needs-manual-review"
        processingTimeMs={2400}
        primaryUsd={0.0042}
        ocrConfidence={0.92}
        beverageType="unknown"
      />,
    );
    const banner = screen.getByRole("alert", {
      name: /beverage type unknown/i,
    });
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toMatch(/Part 4\/5\/7/);
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
