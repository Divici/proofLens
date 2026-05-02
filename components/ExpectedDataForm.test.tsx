import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExpectedDataForm } from "./ExpectedDataForm";
import { DEMO_SCENARIO_01 } from "@/lib/demo/scenarios";

// Capture toast.error calls so we can assert on the failure-path UX without
// mounting the real Sonner portal in jsdom.
const toastErrorMock = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: vi.fn(),
    message: vi.fn(),
  },
}));

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
    // Demo loading was lifted to the page-level "Load demo scenario"
    // button (loads image + form values in one click). The form itself
    // no longer ships an in-form demo affordance.
    expect(
      screen.queryByRole("button", { name: /load demo/i }),
    ).not.toBeInTheDocument();
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

  it("renders with demo scenario values when initialValues is supplied", () => {
    // The page-level "Load demo scenario" handler bumps a `key` and
    // re-renders <ExpectedDataForm initialValues={scenario.data}>. This
    // test stands in for that flow at the unit-test layer.
    render(
      <ExpectedDataForm
        onSubmit={() => {}}
        initialValues={DEMO_SCENARIO_01.data}
      />,
    );

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

  it("marks ABV (Optional) hint when wine is selected with low ABV", async () => {
    const user = userEvent.setup();
    render(<ExpectedDataForm onSubmit={() => {}} />);

    // Switch beverage to wine and set ABV to 12% — a Conditional resolves
    // to Optional under § 4.36 (≤ 14% is optional unless table/light).
    await user.selectOptions(
      screen.getByLabelText(/beverage type/i),
      "wine",
    );
    await user.clear(screen.getByLabelText(/abv/i));
    await user.type(screen.getByLabelText(/abv/i), "12");

    // The form surfaces an "(Optional)" hint next to the ABV field for
    // wines ≤ 14% so reviewers know a missing label ABV won't strict-fail.
    expect(screen.getByText(/abv.*optional/i)).toBeInTheDocument();
  });

  it("does not show ABV optional hint for spirits (ABV always required)", async () => {
    const user = userEvent.setup();
    render(<ExpectedDataForm onSubmit={() => {}} />);
    await user.selectOptions(
      screen.getByLabelText(/beverage type/i),
      "distilled-spirits",
    );
    expect(screen.queryByText(/abv.*optional/i)).not.toBeInTheDocument();
  });

  it("recovers gracefully and surfaces an error toast when the parent onSubmit throws", async () => {
    toastErrorMock.mockClear();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const onSubmit = vi.fn().mockRejectedValue(new Error("upstream boom"));
    const user = userEvent.setup();

    render(
      <ExpectedDataForm
        onSubmit={onSubmit}
        initialValues={DEMO_SCENARIO_01.data}
      />,
    );

    await user.click(screen.getByRole("button", { name: /verify label/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());

    // The thrown rejection must NOT leave the submit button stuck.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /verify label/i }),
      ).not.toBeDisabled();
    });

    // A generic toast surfaces — no internal error prose leaks.
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledOnce();
    });
    const toastArg = toastErrorMock.mock.calls[0]?.[0] as string;
    expect(toastArg).toMatch(/something went wrong/i);
    expect(toastArg).not.toMatch(/upstream boom/i);

    consoleError.mockRestore();
  });
});
