import { describe, expect, it, vi } from "vitest";
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

  it("clicking a field row calls onSelectField (controlled) so the page can drive the bbox highlight on the left-column image", async () => {
    const user = userEvent.setup();
    const onSelectField = vi.fn();
    render(
      <VerificationDetail
        fieldResults={FIELDS}
        overall="fail"
        processingTimeMs={2400}
        primaryUsd={0.0042}
        ocrConfidence={0.92}
        selectedField={null}
        onSelectField={onSelectField}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /brand name/i }),
    );
    expect(onSelectField).toHaveBeenCalledWith("brand");
  });

  it("clicking the currently-selected row toggles selection off (page receives null)", async () => {
    const user = userEvent.setup();
    const onSelectField = vi.fn();
    render(
      <VerificationDetail
        fieldResults={FIELDS}
        overall="fail"
        processingTimeMs={2400}
        primaryUsd={0.0042}
        ocrConfidence={0.92}
        selectedField="brand"
        onSelectField={onSelectField}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /brand name/i }),
    );
    expect(onSelectField).toHaveBeenCalledWith(null);
  });

  it("uncontrolled mode (no onSelectField) — clicking still toggles internal state and doesn't crash", async () => {
    const user = userEvent.setup();
    render(
      <VerificationDetail
        fieldResults={FIELDS}
        overall="fail"
        processingTimeMs={2400}
        primaryUsd={0.0042}
        ocrConfidence={0.92}
      />,
    );
    // Two clicks: select then deselect — should not throw.
    await user.click(
      screen.getByRole("button", { name: /brand name/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /brand name/i }),
    );
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
    // The unknown-beverage banner uses role="status" rather than role="alert"
    // so it doesn't compete with the image-quality banner for screen-reader
    // announcement attention. role="status" is announced politely once the
    // user reaches it rather than interrupting.
    const banner = screen.getByRole("status", {
      name: /beverage type unknown/i,
    });
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toMatch(/Part 4\/5\/7/);
  });

  it("uses non-alert role for the unknown-beverage banner so adjacent banners don't double-announce", () => {
    render(
      <VerificationDetail
        imageSrc="/img.jpg"
        fieldResults={FIELDS}
        overall="needs-manual-review"
        processingTimeMs={2400}
        primaryUsd={0.0042}
        ocrConfidence={0.92}
        imageQualityFlags={["blur"]}
        beverageType="unknown"
      />,
    );
    // Only one role="alert" should exist (the image-quality banner). The
    // unknown-beverage banner is demoted to role="status" so a screen reader
    // doesn't fire two consecutive interruptive announcements.
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveAttribute(
      "aria-label",
      "Image quality issues detected",
    );
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
