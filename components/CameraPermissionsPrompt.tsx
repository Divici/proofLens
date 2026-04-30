"use client";

import { Camera, AlertTriangle, Upload, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CameraErrorCode } from "@/lib/camera/capture";
import { cn } from "@/lib/utils";

/**
 * Permissions UX shell for the camera capture flow.
 *
 * Two visual states:
 *   - `idle`  → educate the user before we trip the OS prompt, plus an
 *               always-available "use file upload instead" escape hatch.
 *   - `error` → human-readable copy keyed by the typed `CameraErrorCode`,
 *               with the same upload fallback. `insecure-context` also
 *               disables the allow button — re-prompting can't help.
 */

export type CameraPromptState =
  | { kind: "idle" }
  | { kind: "error"; code: CameraErrorCode };

export interface CameraPermissionsPromptProps {
  state: CameraPromptState;
  onAllow: () => void;
  onUseUpload: () => void;
  className?: string;
}

const ERROR_COPY: Record<
  CameraErrorCode,
  { title: string; body: string }
> = {
  "permission-denied": {
    title: "Camera permission was denied.",
    body: "Re-enable camera access in your browser's site settings, or switch to file upload below.",
  },
  "not-found": {
    title: "No camera detected on this device.",
    body: "Plug in a webcam or upload a saved image instead.",
  },
  "not-readable": {
    title: "The camera is currently in use by another application.",
    body: "Close other apps using the camera (video calls, other tabs) and try again, or upload an image.",
  },
  "insecure-context": {
    title: "Camera capture requires a secure (HTTPS) connection.",
    body: "Open proofLens over HTTPS or on localhost. File upload still works on this connection.",
  },
};

export function CameraPermissionsPrompt({
  state,
  onAllow,
  onUseUpload,
  className,
}: CameraPermissionsPromptProps) {
  const isError = state.kind === "error";
  const code = isError ? state.code : null;
  const allowDisabled = code === "insecure-context";

  return (
    <div
      className={cn(
        "border-border bg-card/40 flex flex-col items-center gap-4 rounded-xl border p-8 text-center",
        className,
      )}
    >
      <div className="bg-muted text-muted-foreground rounded-full p-3">
        {isError ? (
          <AlertTriangle className="size-6" aria-hidden="true" />
        ) : (
          <Camera className="size-6" aria-hidden="true" />
        )}
      </div>

      {isError ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive flex flex-col gap-1 rounded-lg border p-3 text-left text-sm"
        >
          <strong className="font-semibold">{ERROR_COPY[code!].title}</strong>
          <span className="text-foreground/80">{ERROR_COPY[code!].body}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <h3 className="text-foreground text-base font-semibold">
            Grant camera access to capture a label
          </h3>
          <p className="text-muted-foreground text-sm">
            proofLens uses your device camera to take a photo of the label.
            The image is processed in memory and discarded — only the
            review record (with a 256-px thumbnail) is stored locally.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          size="lg"
          onClick={onAllow}
          disabled={allowDisabled}
        >
          {allowDisabled ? (
            <Lock className="size-4" aria-hidden="true" />
          ) : (
            <Camera className="size-4" aria-hidden="true" />
          )}
          Allow camera
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onUseUpload}
        >
          <Upload className="size-4" aria-hidden="true" />
          Use file upload instead
        </Button>
      </div>
    </div>
  );
}
