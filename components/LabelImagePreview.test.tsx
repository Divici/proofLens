import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LabelImagePreview } from "./LabelImagePreview";
import type { BoundingBox } from "@/lib/verify/types";

const BBOX: BoundingBox = {
  x0: 100,
  y0: 800,
  x1: 420,
  y1: 830,
  imageWidth: 1024,
  imageHeight: 1280,
};

describe("LabelImagePreview", () => {
  it("renders the image element with the supplied src", () => {
    render(
      <LabelImagePreview
        src="/demo-labels/01-spirits-pass.jpg"
        alt="Demo label"
        bbox={null}
      />,
    );
    const img = screen.getByRole("img", { name: /demo label/i });
    expect(img).toHaveAttribute("src", "/demo-labels/01-spirits-pass.jpg");
  });

  it("renders an SVG bbox overlay when a bbox is provided", () => {
    const { container } = render(
      <LabelImagePreview
        src="/demo-labels/01-spirits-pass.jpg"
        alt="Demo label"
        bbox={BBOX}
      />,
    );
    const polygon = container.querySelector("[data-testid='bbox-polygon']");
    expect(polygon).not.toBeNull();
  });

  it("does not render the SVG bbox overlay when bbox is null", () => {
    const { container } = render(
      <LabelImagePreview
        src="/demo-labels/01-spirits-pass.jpg"
        alt="Demo label"
        bbox={null}
      />,
    );
    const polygon = container.querySelector("[data-testid='bbox-polygon']");
    expect(polygon).toBeNull();
  });

  it("renders the default fallback when src is null", () => {
    render(<LabelImagePreview src={null} alt="None" bbox={null} />);
    expect(screen.getByText(/no image uploaded yet/i)).toBeInTheDocument();
  });

  it("renders a custom emptyMessage when supplied and src is null", () => {
    render(
      <LabelImagePreview
        src={null}
        alt="None"
        bbox={null}
        emptyMessage="Image not retained for batch view — open this review from /history to see the original."
      />,
    );
    expect(
      screen.getByText(
        /image not retained for batch view — open this review from \/history/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no image uploaded yet/i),
    ).not.toBeInTheDocument();
  });

  it("uses the bbox's imageWidth/imageHeight as the SVG viewBox", () => {
    const { container } = render(
      <LabelImagePreview
        src="/demo-labels/01-spirits-pass.jpg"
        alt="Demo label"
        bbox={BBOX}
      />,
    );
    const svg = container.querySelector("[data-testid='bbox-overlay']");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 1024 1280");
  });
});
