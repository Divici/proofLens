import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CameraPermissionsPrompt } from "./CameraPermissionsPrompt";

describe("CameraPermissionsPrompt", () => {
  it("renders the explanatory copy and a primary 'Allow camera' button when idle", () => {
    render(
      <CameraPermissionsPrompt
        state={{ kind: "idle" }}
        onAllow={() => {}}
        onUseUpload={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /allow camera/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/grant camera access/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /use file upload instead/i }),
    ).toBeInTheDocument();
  });

  it("shows a permission-denied message and the upload-fallback link", () => {
    const onUseUpload = vi.fn();
    render(
      <CameraPermissionsPrompt
        state={{ kind: "error", code: "permission-denied" }}
        onAllow={() => {}}
        onUseUpload={onUseUpload}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/permission/i);
    expect(
      screen.getByRole("button", { name: /use file upload instead/i }),
    ).toBeInTheDocument();
  });

  it("shows a not-found message when the device has no camera", () => {
    render(
      <CameraPermissionsPrompt
        state={{ kind: "error", code: "not-found" }}
        onAllow={() => {}}
        onUseUpload={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/no camera/i);
  });

  it("shows a not-readable message when the camera is busy", () => {
    render(
      <CameraPermissionsPrompt
        state={{ kind: "error", code: "not-readable" }}
        onAllow={() => {}}
        onUseUpload={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/in use/i);
  });

  it("shows an insecure-context message and disables the allow button", () => {
    render(
      <CameraPermissionsPrompt
        state={{ kind: "error", code: "insecure-context" }}
        onAllow={() => {}}
        onUseUpload={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/secure/i);
    expect(screen.getByRole("button", { name: /allow camera/i })).toBeDisabled();
  });

  it("calls onAllow when the user clicks the allow button", async () => {
    const onAllow = vi.fn();
    render(
      <CameraPermissionsPrompt
        state={{ kind: "idle" }}
        onAllow={onAllow}
        onUseUpload={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /allow camera/i }));
    expect(onAllow).toHaveBeenCalledOnce();
  });

  it("calls onUseUpload when the fallback button is clicked", async () => {
    const onUseUpload = vi.fn();
    render(
      <CameraPermissionsPrompt
        state={{ kind: "error", code: "permission-denied" }}
        onAllow={() => {}}
        onUseUpload={onUseUpload}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /use file upload instead/i }),
    );
    expect(onUseUpload).toHaveBeenCalledOnce();
  });
});
