import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";

function Harness({
  initial = "a",
}: {
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Tabs value={value} onValueChange={setValue}>
      <TabsList aria-label="Test tabs">
        <TabsTrigger value="a">First</TabsTrigger>
        <TabsTrigger value="b">Second</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Panel A</TabsContent>
      <TabsContent value="b">Panel B</TabsContent>
    </Tabs>
  );
}

describe("Tabs primitive", () => {
  it("renders the active panel only", () => {
    render(<Harness />);
    expect(screen.getByText("Panel A")).toBeInTheDocument();
    expect(screen.queryByText("Panel B")).not.toBeInTheDocument();
  });

  it("ARIA: triggers use role=tab and aria-controls the matching tabpanel", () => {
    render(<Harness />);
    const trigger = screen.getByRole("tab", { name: "First" });
    const panel = screen.getByRole("tabpanel");
    expect(trigger).toHaveAttribute("aria-selected", "true");
    expect(trigger).toHaveAttribute("aria-controls", panel.id);
  });

  it("clicking an inactive trigger swaps the visible panel", async () => {
    render(<Harness />);
    const second = screen.getByRole("tab", { name: "Second" });
    await userEvent.click(second);
    expect(screen.getByText("Panel B")).toBeInTheDocument();
    expect(screen.queryByText("Panel A")).not.toBeInTheDocument();
    expect(second).toHaveAttribute("aria-selected", "true");
  });

  it("ArrowRight from the active trigger moves to the next trigger", async () => {
    render(<Harness />);
    const first = screen.getByRole("tab", { name: "First" });
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("Panel B")).toBeInTheDocument();
  });

  it("ArrowLeft wraps from the first trigger to the last", async () => {
    render(<Harness />);
    const first = screen.getByRole("tab", { name: "First" });
    first.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText("Panel B")).toBeInTheDocument();
  });

  it("only the active trigger has tabIndex=0 (roving tabindex)", () => {
    render(<Harness />);
    const first = screen.getByRole("tab", { name: "First" });
    const second = screen.getByRole("tab", { name: "Second" });
    expect(first).toHaveAttribute("tabIndex", "0");
    expect(second).toHaveAttribute("tabIndex", "-1");
  });
});
