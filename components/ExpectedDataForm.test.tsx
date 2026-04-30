import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExpectedDataForm } from "./ExpectedDataForm";
import { DEMO_SCENARIO_01 } from "@/lib/demo/scenarios";

describe("ExpectedDataForm", () => {
  it("renders the PRD §13.1 fields with accessible labels", () => {
    render(<ExpectedDataForm onSubmit={() => {}} />);

    expect(screen.getByLabelText(/brand name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/class.*type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/abv/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/net contents/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bottler.*name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bottler.*address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/country of origin/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/government warning required/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/application notes/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /verify label/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /load demo data/i }),
    ).toBeInTheDocument();
  });

  it("blocks submit and shows validation errors when required fields are empty", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ExpectedDataForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /verify label/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    // At least one validation error appears.
    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
  });

  it("submits parsed ApplicationData when the form is fully populated", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ExpectedDataForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/brand name/i), "Old Tom Distillery");
    await user.type(
      screen.getByLabelText(/class.*type/i),
      "Kentucky Straight Bourbon Whiskey",
    );
    await user.clear(screen.getByLabelText(/abv/i));
    await user.type(screen.getByLabelText(/abv/i), "45");
    await user.type(screen.getByLabelText(/net contents/i), "750 mL");
    await user.type(
      screen.getByLabelText(/bottler.*name/i),
      "Old Tom Distillery, LLC",
    );
    await user.type(
      screen.getByLabelText(/bottler.*address/i),
      "123 Bourbon Lane, Bardstown, KY 40004",
    );
    await user.type(
      screen.getByLabelText(/country of origin/i),
      "United States",
    );

    await user.click(screen.getByRole("button", { name: /verify label/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const submitted = onSubmit.mock.calls[0]?.[0];
    expect(submitted.brand).toBe("Old Tom Distillery");
    expect(submitted.abv).toBe(45);
    expect(submitted.govWarningRequired).toBe(true);
    expect(submitted.beverageType).toBe("distilled-spirits");
  });

  it("populates the form when the user clicks Load demo data", async () => {
    const user = userEvent.setup();
    render(<ExpectedDataForm onSubmit={() => {}} />);

    await user.click(screen.getByRole("button", { name: /load demo data/i }));

    expect(screen.getByLabelText(/brand name/i)).toHaveValue(
      DEMO_SCENARIO_01.data.brand,
    );
    expect(screen.getByLabelText(/abv/i)).toHaveValue(
      DEMO_SCENARIO_01.data.abv,
    );
    expect(screen.getByLabelText(/net contents/i)).toHaveValue(
      DEMO_SCENARIO_01.data.netContents,
    );
  });

  it("disables the submit button while isSubmitting is true", () => {
    render(<ExpectedDataForm onSubmit={() => {}} isSubmitting />);

    const submit = screen.getByRole("button", { name: /verify label/i });
    expect(submit).toBeDisabled();
  });
});
