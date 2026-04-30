"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  Camera,
  Loader2,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CameraCaptureError,
  type CameraErrorCode,
  listCameras,
  requestCameraStream,
  stopStream,
} from "@/lib/camera/capture";
import {
  CAPTURE_JPEG_QUALITY,
  CAPTURE_MAX_EDGE_PX,
  runCapturePreprocess,
} from "@/lib/camera/preprocess-worker";
import { CameraPermissionsPrompt } from "./CameraPermissionsPrompt";
import { cn } from "@/lib/utils";

/**
 * Live camera capture flow for `/review`.
 *
 * State machine:
 *   idle
 *     → user clicks "Allow camera" →
 *   requesting-permissions
 *     → success → previewing
 *     → error   → idle (with error banner)
 *   previewing
 *     → user clicks "Capture" →
 *   captured-pending-review
 *     → user clicks "Retake"  → previewing
 *     → user clicks "Submit"  → submitting → done (calls onCapture)
 *
 * iOS Safari quirks (intentionally explicit — every line below is here
 * because Safari's WebKit camera path was broken in some specific way):
 *   1. The <video> element MUST carry `playsInline`, `muted`, and
 *      `autoPlay`. Without `playsInline` Safari hijacks playback into a
 *      fullscreen player. Without `muted` autoplay is blocked. Without
 *      `autoPlay` the user has to explicitly press play after permission.
 *   2. Assign `srcObject`, then call `play()`. Safari accepts both orders,
 *      this matches the WebKit example and is the most compatible across
 *      browsers. We then trust `loadedmetadata` to fire when the natural
 *      dimensions are known.
 *   3. `getUserMedia` must be called from a user gesture handler. The
 *      "Allow camera" button click satisfies this. The OS-level prompt
 *      can only fire from a user-initiated event on iOS Safari.
 *   4. After capture we tear the stream down explicitly. iOS keeps the
 *      orange "in use" indicator on until *every* track is `.stop()`ed.
 */

export interface CameraCaptureResult {
  blob: Blob;
  width: number;
  height: number;
}

export interface CameraCaptureProps {
  onCapture: (result: CameraCaptureResult) => void;
  onCancel: () => void;
  className?: string;
  /**
   * Inject the frame-grab helper for tests. Production uses the default
   * canvas-backed implementation; jsdom tests stub it because jsdom does
   * not ship a working `<video>` decode pipeline.
   */
  captureFrame?: (video: HTMLVideoElement) => Promise<Blob>;
}

type Phase =
  | { kind: "idle" }
  | { kind: "requesting-permissions" }
  | { kind: "error"; code: CameraErrorCode }
  | { kind: "previewing" }
  | { kind: "preprocessing" }
  | { kind: "capture-failed" }
  | { kind: "captured-pending-review"; result: CameraCaptureResult }
  | { kind: "submitting"; result: CameraCaptureResult };

export function CameraCapture({
  onCapture,
  onCancel,
  className,
  captureFrame = captureFrameToBlob,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showTapHint, setShowTapHint] = useState(false);
  const cameraSelectId = useId();

  /**
   * Tear the stream down. Safe to call on every state transition that
   * leaves an active preview — it's idempotent. iOS Safari requires we
   * stop *every* track for the in-use indicator to vanish (quirk #4).
   */
  const teardownStream = useCallback(() => {
    if (streamRef.current) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Stop the camera on unmount. No exceptions.
  useEffect(() => {
    return () => {
      teardownStream();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, [teardownStream]);

  // Manage the captured-frame preview object URL.
  useEffect(() => {
    const result =
      phase.kind === "captured-pending-review" ||
      phase.kind === "submitting"
        ? phase.result
        : null;
    if (!result) {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(result.blob);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      previewUrlRef.current = null;
    };
  }, [phase]);

  /**
   * iOS Safari can silently reject `play()` outside of a user gesture,
   * leaving the preview frozen at videoWidth=0 with no error. After 1s of
   * stalled preview, we surface a tap-to-start hint that calls play() in
   * a fresh user-gesture context.
   */
  useEffect(() => {
    if (phase.kind !== "previewing") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowTapHint(false);
      return;
    }
    const timer = setTimeout(() => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) {
        setShowTapHint(true);
      }
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [phase]);

  const handleTapToStart = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setShowTapHint(false);
    // Best-effort — swallow rejection; the hint will reappear if the
    // stream is still stalled.
    void video.play().catch(() => {});
  }, []);

  /**
   * Wire the active stream into the <video> element following the
   * iOS-Safari-safe sequence: assign srcObject, then play(). Safari accepts
   * both orders, this matches the WebKit example.
   */
  const attachStreamToVideo = useCallback(async (stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return;
    // Quirk #1 prerequisites are set declaratively on the element below.
    video.srcObject = stream;
    try {
      // Quirk #2: assign srcObject, then play() — Safari accepts both
      // orders, this matches the WebKit example.
      await video.play();
    } catch {
      // Some browsers reject autoplay even when muted; the element is
      // still wired and the user can press capture once preview frames
      // arrive. Swallow the rejection so the UI doesn't trip.
    }
  }, []);

  const handleAllow = useCallback(async () => {
    setPhase({ kind: "requesting-permissions" });
    try {
      const stream = await requestCameraStream({
        facingMode: "environment",
        deviceId: selectedDeviceId ?? undefined,
      });
      streamRef.current = stream;
      setPhase({ kind: "previewing" });
      // Microtask gap so the <video> renders before we attach the stream.
      await Promise.resolve();
      await attachStreamToVideo(stream);
      // Lazy-list cameras now that the user is mid-flow — labels are
      // populated post-permission, so the dropdown reads "Front" / "Rear"
      // instead of empty strings.
      const list = await listCameras();
      setCameras(list);
    } catch (cause) {
      const code: CameraErrorCode =
        cause instanceof CameraCaptureError ? cause.code : "not-readable";
      setPhase({ kind: "error", code });
    }
  }, [attachStreamToVideo, selectedDeviceId]);

  /**
   * Switch active camera (desktop dropdown). Tears the current stream
   * down before requesting the new one to avoid the "two cameras lit"
   * race on platforms that count concurrent users.
   */
  const handleSelectCamera = useCallback(
    async (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      teardownStream();
      try {
        const stream = await requestCameraStream({ deviceId });
        streamRef.current = stream;
        setPhase({ kind: "previewing" });
        await Promise.resolve();
        await attachStreamToVideo(stream);
      } catch (cause) {
        const code: CameraErrorCode =
          cause instanceof CameraCaptureError ? cause.code : "not-readable";
        setPhase({ kind: "error", code });
      }
    },
    [attachStreamToVideo, teardownStream],
  );

  const handleCapture = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setPhase({ kind: "preprocessing" });
    try {
      const blob = await captureFrame(video);
      const processed = await runCapturePreprocess(blob);
      // Stop the camera immediately on capture — frees the indicator and
      // saves battery while the user reviews.
      teardownStream();
      setPhase({
        kind: "captured-pending-review",
        result: {
          blob: processed.blob,
          width: processed.width,
          height: processed.height,
        },
      });
    } catch (cause) {
      console.error("[camera] capture failed", cause);
      // Free the stream so the iOS in-use indicator clears while the
      // user reads the failure copy.
      teardownStream();
      setPhase({ kind: "capture-failed" });
    }
  }, [captureFrame, teardownStream]);

  const handleRetake = useCallback(async () => {
    // Re-request — the stream was torn down on capture.
    setPhase({ kind: "requesting-permissions" });
    try {
      const stream = await requestCameraStream({
        facingMode: "environment",
        deviceId: selectedDeviceId ?? undefined,
      });
      streamRef.current = stream;
      setPhase({ kind: "previewing" });
      await Promise.resolve();
      await attachStreamToVideo(stream);
    } catch (cause) {
      const code: CameraErrorCode =
        cause instanceof CameraCaptureError ? cause.code : "not-readable";
      setPhase({ kind: "error", code });
    }
  }, [attachStreamToVideo, selectedDeviceId]);

  const handleSubmit = useCallback(() => {
    if (phase.kind !== "captured-pending-review") return;
    const result = phase.result;
    setPhase({ kind: "submitting", result });
    onCapture(result);
  }, [onCapture, phase]);

  const showPermissionsShell = useMemo(
    () => phase.kind === "idle" || phase.kind === "error",
    [phase],
  );

  return (
    <div
      className={cn("flex flex-col gap-4", className)}
      data-testid="camera-capture"
      aria-label="Camera capture"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-foreground text-base font-semibold">
          Capture from camera
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            teardownStream();
            onCancel();
          }}
        >
          <X className="size-4" aria-hidden="true" />
          Cancel
        </Button>
      </div>

      {showPermissionsShell ? (
        <CameraPermissionsPrompt
          state={
            phase.kind === "error"
              ? { kind: "error", code: phase.code }
              : { kind: "idle" }
          }
          onAllow={handleAllow}
          onUseUpload={onCancel}
        />
      ) : phase.kind === "capture-failed" ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 flex flex-col items-center gap-3 rounded-xl border p-6 text-center"
        >
          <div className="bg-muted text-destructive rounded-full p-3">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1">
            <strong className="text-foreground text-base font-semibold">
              Capture failed — try again
            </strong>
            <p className="text-muted-foreground text-sm">
              We couldn&apos;t pull a frame from the camera. Tap retake to
              re-open the live preview.
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="w-full sm:w-auto"
            onClick={handleRetake}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Retake
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {cameras.length > 1 && phase.kind === "previewing" ? (
            <div className="flex items-center gap-2 text-sm">
              <label
                htmlFor={cameraSelectId}
                className="text-muted-foreground"
              >
                Select camera
              </label>
              <select
                id={cameraSelectId}
                aria-label="Select camera"
                className="border-border bg-background rounded-md border px-2 py-1 text-xs"
                value={selectedDeviceId ?? ""}
                onChange={(e) => handleSelectCamera(e.target.value)}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {cameras.map((cam) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || `Camera ${cam.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="border-border bg-card relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border">
            {/*
              iOS Safari requires playsInline + muted + autoPlay to embed
              the live preview in-page. See state-machine docblock above
              for the full set of quirks.
            */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              aria-label="Live camera preview"
              className={cn(
                "h-full w-full object-cover",
                (phase.kind === "captured-pending-review" ||
                  phase.kind === "submitting") &&
                  "hidden",
              )}
            />
            {(phase.kind === "captured-pending-review" ||
              phase.kind === "submitting") &&
            previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Captured frame preview"
                className="h-full w-full object-contain"
              />
            ) : null}
            {phase.kind === "preprocessing" ? (
              <div className="bg-background/70 absolute inset-0 flex items-center justify-center text-sm">
                <Loader2
                  className="text-muted-foreground mr-2 size-4 animate-spin"
                  aria-hidden="true"
                />
                Preparing capture…
              </div>
            ) : null}
            {phase.kind === "requesting-permissions" ? (
              <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
                Connecting to camera…
              </div>
            ) : null}
            {phase.kind === "previewing" && showTapHint ? (
              <button
                type="button"
                onClick={handleTapToStart}
                aria-label="Tap preview to start"
                className="bg-background/70 hover:bg-background/80 absolute inset-0 flex cursor-pointer items-center justify-center text-sm font-medium"
              >
                Tap preview to start
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {phase.kind === "previewing" ? (
              <Button
                type="button"
                size="lg"
                className="w-full min-w-40 sm:w-auto"
                onClick={handleCapture}
              >
                <Camera className="size-5" aria-hidden="true" />
                Capture
              </Button>
            ) : null}
            {phase.kind === "captured-pending-review" ||
            phase.kind === "submitting" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleRetake}
                  disabled={phase.kind === "submitting"}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Retake
                </Button>
                <Button
                  type="button"
                  size="lg"
                  onClick={handleSubmit}
                  disabled={phase.kind === "submitting"}
                >
                  <Send className="size-4" aria-hidden="true" />
                  Submit
                </Button>
              </>
            ) : null}
          </div>

          <p className="text-muted-foreground text-xs text-center">
            We resize captures to {CAPTURE_MAX_EDGE_PX}px and encode JPEG q
            {Math.round(CAPTURE_JPEG_QUALITY * 100)} before sending. The
            original frame never leaves your device.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Pull a still frame from the live <video> element via canvas. Returns
 * the raw frame as a Blob; the preprocess pass handles resize + encode.
 *
 * We size the canvas to the natural video dimensions (not the rendered
 * size) so the encode operates at full sensor resolution before the
 * preprocess clamp at 1568px.
 */
async function captureFrameToBlob(video: HTMLVideoElement): Promise<Blob> {
  const width = video.videoWidth || video.clientWidth;
  const height = video.videoHeight || video.clientHeight;
  if (width <= 0 || height <= 0) {
    throw new Error("Video frame is not yet ready to capture.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to acquire 2d canvas context");
  ctx.drawImage(video, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas produced an empty frame"))),
      "image/jpeg",
      0.95,
    );
  });
}
