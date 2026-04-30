import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CameraCaptureError,
  listCameras,
  requestCameraStream,
  stopStream,
} from "./capture";

/**
 * Helpers for exercising the wrapper without a real browser MediaDevices
 * surface. We attach a controllable `mediaDevices` shim to the global
 * `navigator` and tear it down after each test.
 */

interface MockMediaDevices {
  getUserMedia: ReturnType<typeof vi.fn>;
  enumerateDevices: ReturnType<typeof vi.fn>;
}

function installMediaDevices(devices: MockMediaDevices) {
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: devices,
  });
}

function clearMediaDevices() {
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: undefined,
  });
}

function makeFakeStream(): MediaStream {
  const tracks: MediaStreamTrack[] = [
    {
      stop: vi.fn(),
      kind: "video",
      readyState: "live",
    } as unknown as MediaStreamTrack,
    {
      stop: vi.fn(),
      kind: "audio",
      readyState: "live",
    } as unknown as MediaStreamTrack,
  ];
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
  } as unknown as MediaStream;
}

afterEach(() => {
  clearMediaDevices();
  vi.restoreAllMocks();
});

describe("requestCameraStream", () => {
  it("requests a rear-facing video stream by default with audio disabled", async () => {
    const stream = makeFakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    installMediaDevices({
      getUserMedia,
      enumerateDevices: vi.fn().mockResolvedValue([]),
    });

    const result = await requestCameraStream({ facingMode: "environment" });

    expect(result).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1440 },
      },
    });
  });

  it("targets a specific deviceId when one is supplied", async () => {
    const stream = makeFakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    installMediaDevices({
      getUserMedia,
      enumerateDevices: vi.fn().mockResolvedValue([]),
    });

    await requestCameraStream({ deviceId: "cam-42" });

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: expect.objectContaining({
        deviceId: { exact: "cam-42" },
      }),
    });
  });

  it("returns a permission-denied CameraCaptureError when the user blocks access", async () => {
    const error = new DOMException("denied", "NotAllowedError");
    const getUserMedia = vi.fn().mockRejectedValue(error);
    installMediaDevices({
      getUserMedia,
      enumerateDevices: vi.fn().mockResolvedValue([]),
    });

    await expect(requestCameraStream({})).rejects.toMatchObject({
      code: "permission-denied",
      name: "CameraCaptureError",
    });
  });

  it("returns a not-found CameraCaptureError when no camera exists", async () => {
    const error = new DOMException("none", "NotFoundError");
    const getUserMedia = vi.fn().mockRejectedValue(error);
    installMediaDevices({
      getUserMedia,
      enumerateDevices: vi.fn().mockResolvedValue([]),
    });

    await expect(requestCameraStream({})).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("returns a not-readable CameraCaptureError when the camera is in use", async () => {
    const error = new DOMException("busy", "NotReadableError");
    const getUserMedia = vi.fn().mockRejectedValue(error);
    installMediaDevices({
      getUserMedia,
      enumerateDevices: vi.fn().mockResolvedValue([]),
    });

    await expect(requestCameraStream({})).rejects.toMatchObject({
      code: "not-readable",
    });
  });

  it("returns an insecure-context CameraCaptureError when mediaDevices is missing", async () => {
    clearMediaDevices();

    await expect(requestCameraStream({})).rejects.toMatchObject({
      code: "insecure-context",
    });
  });
});

describe("listCameras", () => {
  it("returns only video-input devices", async () => {
    const devices = [
      { kind: "videoinput", deviceId: "vid-1", label: "Front", groupId: "g" },
      { kind: "audioinput", deviceId: "aud-1", label: "Mic", groupId: "g" },
      { kind: "videoinput", deviceId: "vid-2", label: "Rear", groupId: "g" },
    ];
    installMediaDevices({
      getUserMedia: vi.fn(),
      enumerateDevices: vi.fn().mockResolvedValue(devices),
    });

    const cams = await listCameras();
    expect(cams).toHaveLength(2);
    expect(cams.map((c) => c.deviceId)).toEqual(["vid-1", "vid-2"]);
  });

  it("returns an empty array when mediaDevices is unavailable", async () => {
    clearMediaDevices();
    await expect(listCameras()).resolves.toEqual([]);
  });
});

describe("stopStream", () => {
  it("calls .stop() on every track", () => {
    const stream = makeFakeStream();
    const tracks = stream.getTracks();
    stopStream(stream);
    for (const track of tracks) {
      expect(track.stop).toHaveBeenCalledOnce();
    }
  });

  it("is a no-op when given null/undefined", () => {
    expect(() => stopStream(null)).not.toThrow();
    expect(() => stopStream(undefined)).not.toThrow();
  });
});

describe("CameraCaptureError", () => {
  it("exposes a typed code and inherits from Error", () => {
    const err = new CameraCaptureError("permission-denied", "denied");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("permission-denied");
    expect(err.name).toBe("CameraCaptureError");
  });
});

beforeEach(() => {
  clearMediaDevices();
});
