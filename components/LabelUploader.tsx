"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ImagePlus, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LabelUploaderProps {
  onFileSelected: (file: File) => void;
  previewUrl?: string | null;
  previewAlt?: string;
  className?: string;
}

// Limited to formats sharp ships with on Vercel functions out of the box.
// HEIC/HEIF require a libheif build that isn't included, so we don't accept
// them — keep this in sync with the user-facing copy below.
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

/**
 * Drag-and-drop + click-to-upload label image picker. Validates that the
 * dropped/selected file has an `image/*` MIME type before bubbling it
 * back through `onFileSelected`. The preview thumbnail (when provided)
 * sits inside the same drop target so the user can swap images at any
 * point in the review.
 */
export function LabelUploader({
  onFileSelected,
  previewUrl,
  previewAlt = "Uploaded label preview",
  className,
}: LabelUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptFile = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError("Please upload an image file (JPEG, PNG, WEBP).");
        return;
      }
      setError(null);
      onFileSelected(file);
    },
    [onFileSelected],
  );

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload label image"
        aria-describedby={`${inputId}-description`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragOver(false);
          const file = event.dataTransfer?.files?.[0];
          acceptFile(file);
        }}
        className={cn(
          "flex min-h-[280px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card/40 p-6 text-center transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          isDragOver && "border-primary bg-primary/5",
          previewUrl && "min-h-[320px] p-3",
        )}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={previewAlt}
            className="max-h-[420px] w-auto rounded-lg object-contain"
          />
        ) : (
          <>
            <div className="rounded-full bg-muted p-3 text-muted-foreground">
              <UploadCloud className="size-6" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                Drag and drop a label image, or click to upload
              </p>
              <p
                id={`${inputId}-description`}
                className="text-xs text-muted-foreground"
              >
                JPEG, PNG, WEBP. We rotate, resize, and compress on the
                server before extraction.
              </p>
            </div>
          </>
        )}

        {previewUrl ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <ImagePlus className="size-4" aria-hidden="true" />
            <span>Click to choose a different image</span>
          </div>
        ) : null}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_TYPES}
        aria-label="Upload label image"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          acceptFile(file);
          // Reset so the same filename can be chosen twice in a row.
          event.target.value = "";
        }}
      />

      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
