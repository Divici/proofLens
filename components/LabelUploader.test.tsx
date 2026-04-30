import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelUploader } from "./LabelUploader";

function makeFile(name = "label.jpg", type = "image/jpeg"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("LabelUploader", () => {
  it("renders a drop zone with click-to-upload affordance", () => {
    render(<LabelUploader onFileSelected={() => {}} />);
    expect(
      screen.getByRole("button", { name: /upload label image/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/drag and drop|click to upload/i),
    ).toBeInTheDocument();
  });

  it("calls onFileSelected when a user picks a JPEG via the file input", async () => {
    const onFileSelected = vi.fn();
    const user = userEvent.setup();
    render(<LabelUploader onFileSelected={onFileSelected} />);

    const input = screen.getByLabelText(/upload label image/i, {
      selector: "input",
    }) as HTMLInputElement;
    const file = makeFile("bourbon.jpg", "image/jpeg");
    await user.upload(input, file);

    expect(onFileSelected).toHaveBeenCalledOnce();
    expect(onFileSelected.mock.calls[0]?.[0]).toBe(file);
  });

  it("rejects non-image MIME types when dropped and surfaces an error message", () => {
    const onFileSelected = vi.fn();
    render(<LabelUploader onFileSelected={onFileSelected} />);

    const dropZone = screen.getByRole("button", {
      name: /upload label image/i,
    });
    const file = makeFile("notes.txt", "text/plain");
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file], items: [], types: ["Files"] },
    });

    expect(onFileSelected).not.toHaveBeenCalled();
    expect(
      screen.getByText(/please upload an image/i),
    ).toBeInTheDocument();
  });

  it("accepts an image dropped via drag-and-drop", () => {
    const onFileSelected = vi.fn();
    render(<LabelUploader onFileSelected={onFileSelected} />);

    const dropZone = screen.getByRole("button", {
      name: /upload label image/i,
    });
    const file = makeFile("dropped.png", "image/png");

    fireEvent.dragOver(dropZone);
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file], items: [], types: ["Files"] },
    });

    expect(onFileSelected).toHaveBeenCalledOnce();
    expect(onFileSelected.mock.calls[0]?.[0]).toBe(file);
  });

  it("renders an image preview when a previewUrl is provided", () => {
    render(
      <LabelUploader
        onFileSelected={() => {}}
        previewUrl="/demo-labels/01-spirits-pass.jpg"
        previewAlt="Bourbon label preview"
      />,
    );

    const img = screen.getByRole("img", { name: /bourbon label preview/i });
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toContain("/demo-labels/");
  });
});
