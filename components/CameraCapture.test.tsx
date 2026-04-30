import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The CameraCapture component is the camera state machine. We mock the
 * lower-level `lib/camera/capture` wrapper and the preprocess helper so
 * the tests stay deterministic. Real `getUserMedia` runs in the
 * Playwright e2e (which uses Chromium's `--use-fake-ui-for-media-stream`).
 */

const mockRequestCameraStream = vi.fn();
const mockListCameras = vi.fn();
const mockStopStream = vi.fn();

vi.mock("@/lib/camera/capture", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/camera/capture")>(
      "@/lib/camera/capture",
    );
  return {
    ...actual,
    requestCameraStream: (...args: unknown[]) =>
      mockRequestCameraStream(...args),
    listCameras: (...args: unknown[]) => mockListCameras(...args),
    stopStream: (...args: unknown[]) => mockStopStream(...args),
  };
});

const mockRunPreprocess = vi.fn();
vi.mock("@/lib/camera/preprocess-worker", () => ({
  runCapturePreprocess: (...args: unknown[]) => mockRunPreprocess(...args),
  CAPTURE_MAX_EDGE_PX: 1568,
  CAPTURE_JPEG_QUALITY: 0.85,
}));

import { CameraCapture } from "./CameraCapture";

function makeFakeStream(): MediaStream {
  const tracks = [
    {
      stop: vi.fn(),
      kind: "video",
    } as unknown as MediaStreamTrack,
  ];
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks,
  } as unknown as MediaStream;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Stub the video element APIs jsdom doesn't ship.
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();

  // Default happy paths.
  mockRequestCameraStream.mockResolvedValue(makeFakeStream());
  mockListCameras.mockResolvedValue([]);
  mockRunPreprocess.mockResolvedValue({
    blob: new Blob(["jpeg"], { type: "image/jpeg" }),
    width: 1568,
    height: 1045,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CameraCapture", () => {
  it("starts in idle state with the permissions prompt visible", () => {
    render(<CameraCapture onCapture={() => {}} onCancel={() => {}} />);
    expect(
      screen.getByRole("button", { name: /allow camera/i }),
    ).toBeInTheDocument();
    expect(mockRequestCameraStream).not.toHaveBeenCalled();
  });

  it("requests a stream when the user clicks Allow camera and shows the live preview", async () => {
    const user = userEvent.setup();
    render(<CameraCapture onCapture={() => {}} onCancel={() => {}} />);

    await user.click(screen.getByRole("button", { name: /allow camera/i }));

    await waitFor(() => {
      expect(mockRequestCameraStream).toHaveBeenCalledOnce();
    });
    expect(mockRequestCameraStream.mock.calls[0]?.[0]).toMatchObject({
      facingMode: "environment",
    });

    // Live preview present (video element + capture button).
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^capture$/i }),
      ).toBeInTheDocument();
    });
  });

  it("renders a typed error and the upload-fallback when getUserMedia denies", async () => {
    const user = userEvent.setup();
    const { CameraCaptureError } = await import("@/lib/camera/capture");
    mockRequestCameraStream.mockRejectedValueOnce(
      new CameraCaptureError("permission-denied", "denied"),
    );

    render(<CameraCapture onCapture={() => {}} onCancel={() => {}} />);
    await user.click(screen.getByRole("button", { name: /allow camera/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/permission/i);
    });
    expect(
      screen.getByRole("button", { name: /use file upload instead/i }),
    ).toBeInTheDocument();
  });

  it("captures a frame, runs preprocess, and shows retake/submit when capture is pressed", async () => {
    const user = userEvent.setup();
    render(
      <CameraCapture
        onCapture={() => {}}
        onCancel={() => {}}
        captureFrame={async () => new Blob(["raw"], { type: "image/jpeg" })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /allow camera/i }));
    await waitFor(() =>
      screen.getByRole("button", { name: /^capture$/i }),
    );

    // jsdom has no real <video> decode, so we inject a frame-grab stub.
    await user.click(screen.getByRole("button", { name: /^capture$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /retake/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /submit/i }),
      ).toBeInTheDocument();
    });
    expect(mockRunPreprocess).toHaveBeenCalledOnce();
  });

  it("emits the captured Blob via onCapture when Submit is clicked", async () => {
    const user = userEvent.setup();
    const onCapture = vi.fn();
    const captured = new Blob(["jpeg"], { type: "image/jpeg" });
    mockRunPreprocess.mockResolvedValue({
      blob: captured,
      width: 1568,
      height: 1045,
    });

    render(
      <CameraCapture
        onCapture={onCapture}
        onCancel={() => {}}
        captureFrame={async () => new Blob(["raw"], { type: "image/jpeg" })}
      />,
    );
    await user.click(screen.getByRole("button", { name: /allow camera/i }));
    await waitFor(() => screen.getByRole("button", { name: /^capture$/i }));

    await user.click(screen.getByRole("button", { name: /^capture$/i }));
    await waitFor(() => screen.getByRole("button", { name: /submit/i }));

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onCapture).toHaveBeenCalledOnce();
    const call = onCapture.mock.calls[0]?.[0] as
      | { blob: Blob; width: number; height: number }
      | undefined;
    expect(call?.blob).toBe(captured);
    expect(call?.width).toBe(1568);
    expect(call?.height).toBe(1045);
  });

  it("returns to live preview when Retake is clicked", async () => {
    const user = userEvent.setup();
    render(
      <CameraCapture
        onCapture={() => {}}
        onCancel={() => {}}
        captureFrame={async () => new Blob(["raw"], { type: "image/jpeg" })}
      />,
    );
    await user.click(screen.getByRole("button", { name: /allow camera/i }));
    await waitFor(() => screen.getByRole("button", { name: /^capture$/i }));

    await user.click(screen.getByRole("button", { name: /^capture$/i }));
    await waitFor(() => screen.getByRole("button", { name: /retake/i }));

    await user.click(screen.getByRole("button", { name: /retake/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^capture$/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /submit/i }),
    ).not.toBeInTheDocument();
  });

  it("stops the stream on unmount", async () => {
    const user = userEvent.setup();
    const stream = makeFakeStream();
    mockRequestCameraStream.mockResolvedValueOnce(stream);

    const { unmount } = render(
      <CameraCapture onCapture={() => {}} onCancel={() => {}} />,
    );
    await user.click(screen.getByRole("button", { name: /allow camera/i }));
    await waitFor(() => screen.getByRole("button", { name: /^capture$/i }));

    unmount();
    expect(mockStopStream).toHaveBeenCalled();
  });

  it("renders a device picker when more than one camera is available", async () => {
    const user = userEvent.setup();
    mockListCameras.mockResolvedValue([
      { deviceId: "cam-front", label: "Front", kind: "videoinput", groupId: "g" },
      { deviceId: "cam-rear", label: "Rear", kind: "videoinput", groupId: "g" },
    ]);

    render(<CameraCapture onCapture={() => {}} onCancel={() => {}} />);
    await user.click(screen.getByRole("button", { name: /allow camera/i }));

    await waitFor(() =>
      screen.getByRole("button", { name: /^capture$/i }),
    );
    expect(
      screen.getByLabelText(/select camera/i),
    ).toBeInTheDocument();
  });

  it("calls onCancel when the user clicks Cancel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<CameraCapture onCapture={() => {}} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
