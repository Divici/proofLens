/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BatchQueue, type BatchQueueItem } from "./BatchQueue";

const baseExpected = {
  brand: "B",
  classType: "C",
  abv: 40,
  netContents: "750 mL",
  bottlerName: "BR",
  bottlerAddress: "ADDR",
  countryOfOrigin: "United States",
  govWarningRequired: true,
  applicationNotes: "",
  beverageType: "distilled-spirits" as const,
};

function buildItems(): BatchQueueItem[] {
  return [
    {
      id: "1",
      filename: "a.jpg",
      brand: "Alpha",
      beverageType: "distilled-spirits",
      status: "complete",
      overall: "pass",
      errorMessage: null,
      processingTimeMs: 1000,
      hasFailures: false,
      hasOverrides: false,
      expected: { ...baseExpected, brand: "Alpha" },
      response: null,
    },
    {
      id: "2",
      filename: "b.jpg",
      brand: "Beta",
      beverageType: "wine",
      status: "complete",
      overall: "fail",
      errorMessage: null,
      processingTimeMs: 1500,
      hasFailures: true,
      hasOverrides: false,
      expected: { ...baseExpected, brand: "Beta", beverageType: "wine" },
      response: null,
    },
    {
      id: "3",
      filename: "c.jpg",
      brand: "Cee",
      beverageType: "distilled-spirits",
      status: "failed",
      overall: null,
      errorMessage: "Network unreachable",
      processingTimeMs: 200,
      hasFailures: false,
      hasOverrides: false,
      expected: { ...baseExpected, brand: "Cee" },
      response: null,
    },
    {
      id: "4",
      filename: "d.jpg",
      brand: "Delta",
      beverageType: "malt-beverage",
      status: "complete",
      overall: "needs-manual-review",
      errorMessage: null,
      processingTimeMs: 2000,
      hasFailures: false,
      hasOverrides: true,
      expected: { ...baseExpected, brand: "Delta", beverageType: "malt-beverage" },
      response: null,
    },
  ];
}

describe("BatchQueue", () => {
  it("renders one row per item with filename + brand", () => {
    render(
      <BatchQueue
        items={buildItems()}
        onRetryFailed={() => {}}
        onRetryAll={() => {}}
        onOpenDetail={() => {}}
      />,
    );
    expect(screen.getAllByTestId("batch-queue-row")).toHaveLength(4);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText(/network unreachable/i)).toBeInTheDocument();
  });

  it("filters by status (only failed)", async () => {
    const user = userEvent.setup();
    render(
      <BatchQueue
        items={buildItems()}
        onRetryFailed={() => {}}
        onRetryAll={() => {}}
        onOpenDetail={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /failed only/i }));
    const rows = screen.getAllByTestId("batch-queue-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0] as HTMLElement).getByText(/cee/i)).toBeInTheDocument();
  });

  it("filters by has-overrides", async () => {
    const user = userEvent.setup();
    render(
      <BatchQueue
        items={buildItems()}
        onRetryFailed={() => {}}
        onRetryAll={() => {}}
        onOpenDetail={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /overridden only/i }));
    const rows = screen.getAllByTestId("batch-queue-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0] as HTMLElement).getByText(/delta/i)).toBeInTheDocument();
  });

  it("filters by beverage type", async () => {
    const user = userEvent.setup();
    render(
      <BatchQueue
        items={buildItems()}
        onRetryFailed={() => {}}
        onRetryAll={() => {}}
        onOpenDetail={() => {}}
      />,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /beverage filter/i }),
      "wine",
    );
    const rows = screen.getAllByTestId("batch-queue-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0] as HTMLElement).getByText(/beta/i)).toBeInTheDocument();
  });

  it("retry single — calls onRetryFailed with the row's id", async () => {
    const user = userEvent.setup();
    const onRetryFailed = vi.fn();
    render(
      <BatchQueue
        items={buildItems()}
        onRetryFailed={onRetryFailed}
        onRetryAll={() => {}}
        onOpenDetail={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /retry c\.jpg/i }));
    expect(onRetryFailed).toHaveBeenCalledWith("3");
  });

  it("retry all failed — calls onRetryAll", async () => {
    const user = userEvent.setup();
    const onRetryAll = vi.fn();
    render(
      <BatchQueue
        items={buildItems()}
        onRetryFailed={() => {}}
        onRetryAll={onRetryAll}
        onOpenDetail={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /retry all failed/i }));
    expect(onRetryAll).toHaveBeenCalledTimes(1);
  });

  it("opens detail modal when a row is clicked", async () => {
    const user = userEvent.setup();
    const onOpenDetail = vi.fn();
    render(
      <BatchQueue
        items={buildItems()}
        onRetryFailed={() => {}}
        onRetryAll={() => {}}
        onOpenDetail={onOpenDetail}
      />,
    );
    await user.click(screen.getByRole("button", { name: /open a\.jpg/i }));
    expect(onOpenDetail).toHaveBeenCalledWith("1");
  });

  it("hides the Reset filters button while all filters are at their defaults", () => {
    render(
      <BatchQueue
        items={buildItems()}
        onRetryFailed={() => {}}
        onRetryAll={() => {}}
        onOpenDetail={() => {}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /reset filters/i }),
    ).not.toBeInTheDocument();
  });

  it("shows + applies the Reset filters button when any filter is non-default", async () => {
    const user = userEvent.setup();
    render(
      <BatchQueue
        items={buildItems()}
        onRetryFailed={() => {}}
        onRetryAll={() => {}}
        onOpenDetail={() => {}}
      />,
    );
    // Apply a non-default status filter.
    await user.click(screen.getByRole("button", { name: /failed only/i }));
    const reset = screen.getByRole("button", { name: /reset filters/i });
    expect(reset).toBeInTheDocument();
    // Clicking it restores all rows.
    await user.click(reset);
    expect(screen.getAllByTestId("batch-queue-row")).toHaveLength(4);
    expect(
      screen.queryByRole("button", { name: /reset filters/i }),
    ).not.toBeInTheDocument();
  });

  it("Reset filters also clears the beverage filter", async () => {
    const user = userEvent.setup();
    render(
      <BatchQueue
        items={buildItems()}
        onRetryFailed={() => {}}
        onRetryAll={() => {}}
        onOpenDetail={() => {}}
      />,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /beverage filter/i }),
      "wine",
    );
    expect(screen.getAllByTestId("batch-queue-row")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /reset filters/i }));
    expect(screen.getAllByTestId("batch-queue-row")).toHaveLength(4);
  });

  it("renders empty state when nothing matches the active filter", async () => {
    const user = userEvent.setup();
    render(
      <BatchQueue
        items={[buildItems()[0] as BatchQueueItem]}
        onRetryFailed={() => {}}
        onRetryAll={() => {}}
        onOpenDetail={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /failed only/i }));
    expect(screen.getByText(/no rows match/i)).toBeInTheDocument();
  });
});
