import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationDataView } from "./ApplicationDataView";
import type { ApplicationData } from "@/lib/ai/schema";

const SAMPLE: ApplicationData = {
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
};

describe("ApplicationDataView (read-only display for queue flow)", () => {
  it("renders every regulated field as read-only text — no inputs, no editable form", () => {
    render(<ApplicationDataView data={SAMPLE} onVerify={() => {}} />);
    // Brand / Class / ABV / Net contents / Bottler / Address / Country
    expect(screen.getByText("Old Tom Distillery")).toBeInTheDocument();
    expect(
      screen.getByText("Kentucky Straight Bourbon Whiskey"),
    ).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("750 mL")).toBeInTheDocument();
    expect(screen.getByText("Old Tom Distillery, LLC")).toBeInTheDocument();
    expect(
      screen.getByText("123 Bourbon Lane, Bardstown, KY 40004"),
    ).toBeInTheDocument();
    expect(screen.getByText("United States")).toBeInTheDocument();
    // Distilled spirits / wine / malt / unknown — render the human label.
    expect(screen.getByText(/distilled spirits/i)).toBeInTheDocument();
    // Application notes echo through.
    expect(screen.getByText("TTB-2026-00001")).toBeInTheDocument();
  });

  it("contains zero text inputs / textareas — application data is read-only in the queue flow", () => {
    const { container } = render(
      <ApplicationDataView data={SAMPLE} onVerify={() => {}} />,
    );
    expect(container.querySelectorAll("input").length).toBe(0);
    expect(container.querySelectorAll("textarea").length).toBe(0);
  });

  it("renders a 'Verify label' button that calls onVerify on click", async () => {
    const onVerify = vi.fn();
    render(<ApplicationDataView data={SAMPLE} onVerify={onVerify} />);
    const button = screen.getByRole("button", { name: /verify label/i });
    await userEvent.click(button);
    expect(onVerify).toHaveBeenCalledTimes(1);
  });

  it("disables the Verify button while isVerifying is true", () => {
    render(
      <ApplicationDataView
        data={SAMPLE}
        onVerify={() => {}}
        isVerifying
      />,
    );
    expect(screen.getByRole("button", { name: /verifying/i })).toBeDisabled();
  });

  it("shows a 'Government warning required' badge when govWarningRequired", () => {
    render(<ApplicationDataView data={SAMPLE} onVerify={() => {}} />);
    expect(screen.getByText(/government warning required/i)).toBeInTheDocument();
  });

  it("hides the government-warning badge when govWarningRequired=false", () => {
    render(
      <ApplicationDataView
        data={{ ...SAMPLE, govWarningRequired: false }}
        onVerify={() => {}}
      />,
    );
    expect(
      screen.queryByText(/government warning required/i),
    ).not.toBeInTheDocument();
  });

  it("includes a brief 'On file with this application' caption (frames the data as the application's source-of-truth)", () => {
    render(<ApplicationDataView data={SAMPLE} onVerify={() => {}} />);
    expect(screen.getByText(/on file with this application/i)).toBeInTheDocument();
  });
});
