/**
 * Typed wrapper around `navigator.mediaDevices.getUserMedia` for proofLens.
 *
 * The browser API surface throws a grab-bag of `DOMException` codes; this
 * module collapses them into a small, typed taxonomy the UI can switch on
 * without sniffing strings:
 *
 *   - permission-denied    user blocked the prompt
 *   - not-found            no camera is connected
 *   - not-readable         camera is in use by another app / driver fault
 *   - insecure-context     getUserMedia unavailable (HTTP / sandboxed iframe)
 *
 * No dependencies on React or the DOM beyond `navigator`. Safe to import
 * from anywhere — the module simply rejects with `insecure-context` when
 * `mediaDevices` is missing (server, jsdom-without-shim, file://).
 */

export type CameraErrorCode =
  | "permission-denied"
  | "not-found"
  | "not-readable"
  | "insecure-context";

/** Typed error class so consumers can `instanceof` and switch on `.code`. */
export class CameraCaptureError extends Error {
  readonly code: CameraErrorCode;

  constructor(code: CameraErrorCode, message: string) {
    super(message);
    this.name = "CameraCaptureError";
    this.code = code;
  }
}

export interface RequestCameraStreamOptions {
  /**
   * Mobile defaults to `environment` (rear camera). Desktop falls through
   * the `ideal` constraint and lands on the first available device.
   */
  facingMode?: "environment" | "user";
  /** Pin a specific camera (desktop dropdown selection). Wins over facingMode. */
  deviceId?: string;
}

const TARGET_RESOLUTION = { width: 1920, height: 1440 };

/**
 * Request a `MediaStream` for label capture. Audio is always disabled —
 * proofLens never records sound. Resolution is requested at 1920×1440
 * (we downscale to 1568px on capture); the browser is free to negotiate
 * down on lower-spec hardware.
 */
export async function requestCameraStream(
  opts: RequestCameraStreamOptions,
): Promise<MediaStream> {
  const md = getMediaDevices();
  if (!md) {
    throw new CameraCaptureError(
      "insecure-context",
      "Camera access requires a secure (HTTPS or localhost) context.",
    );
  }

  const video: MediaTrackConstraints = {
    width: { ideal: TARGET_RESOLUTION.width },
    height: { ideal: TARGET_RESOLUTION.height },
  };
  if (opts.deviceId) {
    video.deviceId = { exact: opts.deviceId };
  } else if (opts.facingMode) {
    video.facingMode = { ideal: opts.facingMode };
  }

  try {
    return await md.getUserMedia({ audio: false, video });
  } catch (cause) {
    throw mapToCameraError(cause);
  }
}

/**
 * Enumerate connected video-input devices for the desktop dropdown.
 * Returns an empty array when `mediaDevices` is unavailable — the caller
 * (and UI) treat that as "no choice to offer".
 */
export async function listCameras(): Promise<MediaDeviceInfo[]> {
  const md = getMediaDevices();
  if (!md) return [];
  try {
    const all = await md.enumerateDevices();
    return all.filter((d) => d.kind === "videoinput");
  } catch {
    return [];
  }
}

/**
 * Stop every track on the supplied stream so the browser releases the
 * camera hardware and the OS-level "in use" indicator turns off.
 * Idempotent — safe to call on an already-stopped stream, null, or
 * undefined (`useEffect` cleanup paths).
 */
export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Defensive — some platforms throw if a track is already ended.
    }
  }
}

function getMediaDevices(): MediaDevices | null {
  if (typeof navigator === "undefined") return null;
  const md = (navigator as Navigator & { mediaDevices?: MediaDevices })
    .mediaDevices;
  if (!md || typeof md.getUserMedia !== "function") return null;
  return md;
}

function mapToCameraError(cause: unknown): CameraCaptureError {
  if (cause instanceof CameraCaptureError) return cause;
  const name = typeof cause === "object" && cause !== null && "name" in cause
    ? String((cause as { name: unknown }).name)
    : "";
  const message =
    typeof cause === "object" && cause !== null && "message" in cause
      ? String((cause as { message: unknown }).message)
      : "Camera request failed";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return new CameraCaptureError(
        "permission-denied",
        "Camera permission was denied.",
      );
    case "NotFoundError":
    case "OverconstrainedError":
      return new CameraCaptureError(
        "not-found",
        "No camera matching the requested constraints was found.",
      );
    case "NotReadableError":
    case "AbortError":
    case "TrackStartError":
      return new CameraCaptureError(
        "not-readable",
        "The camera is already in use by another application.",
      );
    default:
      return new CameraCaptureError("not-readable", message);
  }
}
