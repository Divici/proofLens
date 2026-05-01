/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BatchDropzone } from "./BatchDropzone";

function imageFile(name: string): File {
  return new File([new Uint8Array([0xff])], name, { type: "image/jpeg" });
}

describe("BatchDropzone", () => {
  it("renders both label + paired-data dropzones", () => {
    render(
      <BatchDropzone
        labels={[]}
        pairedRows={[]}
        warnings={[]}
        onLabelsAdded={() => {}}
        onPairedTextLoaded={() => {}}
        onClear={() => {}}
        onStart={() => {}}
        starting={false}
      />,
    );
    expect(screen.getByLabelText(/upload label files/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/upload paired csv or json/i),
    ).toBeInTheDocument();
  });

  it("calls onLabelsAdded when files are picked", async () => {
    const user = userEvent.setup();
    const onLabelsAdded = vi.fn();
    render(
      <BatchDropzone
        labels={[]}
        pairedRows={[]}
        warnings={[]}
        onLabelsAdded={onLabelsAdded}
        onPairedTextLoaded={() => {}}
        onClear={() => {}}
        onStart={() => {}}
        starting={false}
      />,
    );
    const input = screen
      .getByLabelText(/upload label files/i)
      .querySelector("input[type=file]") as HTMLInputElement;
    await user.upload(input, [imageFile("a.jpg"), imageFile("b.jpg")]);
    expect(onLabelsAdded).toHaveBeenCalledTimes(1);
    expect(onLabelsAdded.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it("disables the Start button when no labels are queued", () => {
    render(
      <BatchDropzone
        labels={[]}
        pairedRows={[]}
        warnings={[]}
        onLabelsAdded={() => {}}
        onPairedTextLoaded={() => {}}
        onClear={() => {}}
        onStart={() => {}}
        starting={false}
      />,
    );
    expect(screen.getByRole("button", { name: /start batch/i })).toBeDisabled();
  });

  it("enables Start once labels + matching paired rows exist", () => {
    const file = imageFile("a.jpg");
    render(
      <BatchDropzone
        labels={[file]}
        pairedRows={[
          {
            filename: "a.jpg",
            expected: {
              brand: "B",
              classType: "C",
              abv: 40,
              netContents: "750 mL",
              bottlerName: "BR",
              bottlerAddress: "ADDR",
              countryOfOrigin: "United States",
              govWarningRequired: true,
              applicationNotes: "",
              beverageType: "distilled-spirits",
            },
          },
        ]}
        warnings={[]}
        onLabelsAdded={() => {}}
        onPairedTextLoaded={() => {}}
        onClear={() => {}}
        onStart={() => {}}
        starting={false}
      />,
    );
    expect(screen.getByRole("button", { name: /start batch/i })).toBeEnabled();
  });

  it("disables Start with a tooltip when startDisabledReason is provided", () => {
    const file = imageFile("a.jpg");
    render(
      <BatchDropzone
        labels={[file]}
        pairedRows={[
          {
            filename: "a.jpg",
            expected: {
              brand: "B",
              classType: "C",
              abv: 40,
              netContents: "750 mL",
              bottlerName: "BR",
              bottlerAddress: "ADDR",
              countryOfOrigin: "United States",
              govWarningRequired: true,
              applicationNotes: "",
              beverageType: "distilled-spirits",
            },
          },
        ]}
        warnings={[]}
        onLabelsAdded={() => {}}
        onPairedTextLoaded={() => {}}
        onClear={() => {}}
        onStart={() => {}}
        starting={false}
        startDisabledReason="Enter a reviewer name above to start the batch."
      />,
    );
    const btn = screen.getByRole("button", { name: /start batch/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute(
      "title",
      "Enter a reviewer name above to start the batch.",
    );
  });

  it("shows the soft confirmation modal when 50+ labels are present", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const labels = Array.from({ length: 50 }, (_, i) =>
      imageFile(`l${i}.jpg`),
    );
    const pairedRows = labels.map((f) => ({
      filename: f.name,
      expected: {
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
      },
    }));
    render(
      <BatchDropzone
        labels={labels}
        pairedRows={pairedRows}
        warnings={[]}
        onLabelsAdded={() => {}}
        onPairedTextLoaded={() => {}}
        onClear={() => {}}
        onStart={onStart}
        starting={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /start batch/i }));
    // Confirmation modal appears with cost + ETA copy
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/estimate/i);
    expect(dialog).toHaveTextContent(/\$0\.50/);
    expect(onStart).not.toHaveBeenCalled();
    await user.click(
      dialog.querySelector("button[data-action=confirm]") as HTMLButtonElement,
    );
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("shows the trim modal when the drop exceeds the hard cap", async () => {
    const user = userEvent.setup();
    const onLabelsAdded = vi.fn();
    render(
      <BatchDropzone
        labels={[]}
        pairedRows={[]}
        warnings={[]}
        onLabelsAdded={onLabelsAdded}
        onPairedTextLoaded={() => {}}
        onClear={() => {}}
        onStart={() => {}}
        starting={false}
      />,
    );
    const input = screen
      .getByLabelText(/upload label files/i)
      .querySelector("input[type=file]") as HTMLInputElement;
    const tooMany = Array.from({ length: 251 }, (_, i) =>
      imageFile(`f${i}.jpg`),
    );
    await user.upload(input, tooMany);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/250/);
    expect(dialog).toHaveTextContent(/trim/i);
    // Cancel does NOT add files
    await user.click(
      dialog.querySelector("button[data-action=cancel]") as HTMLButtonElement,
    );
    expect(onLabelsAdded).not.toHaveBeenCalled();
  });

  it("loads CSV text into onPairedTextLoaded when a CSV file is dropped", async () => {
    const onPairedTextLoaded = vi.fn();
    render(
      <BatchDropzone
        labels={[]}
        pairedRows={[]}
        warnings={[]}
        onLabelsAdded={() => {}}
        onPairedTextLoaded={onPairedTextLoaded}
        onClear={() => {}}
        onStart={() => {}}
        starting={false}
      />,
    );
    const csvInput = screen
      .getByLabelText(/upload paired csv or json/i)
      .querySelector("input[type=file]") as HTMLInputElement;
    const csv = new File(
      ["filename,brand\nfoo.jpg,Foo"],
      "data.csv",
      { type: "text/csv" },
    );
    fireEvent.change(csvInput, { target: { files: [csv] } });
    // The component reads the file via FileReader; the test environment
    // returns the body asynchronously.
    await new Promise((r) => setTimeout(r, 50));
    expect(onPairedTextLoaded).toHaveBeenCalledTimes(1);
    const [text, kind] = onPairedTextLoaded.mock.calls[0] ?? [];
    expect(text).toMatch(/filename,brand/);
    expect(kind).toBe("csv");
  });
});
