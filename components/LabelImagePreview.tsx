"use client";

import type { BoundingBox } from "@/lib/verify/types";
import { cn } from "@/lib/utils";

export interface LabelImagePreviewProps {
  src: string | null;
  alt: string;
  bbox: BoundingBox | null;
  className?: string;
  /**
   * Override the no-image fallback copy. Used in batch context where the
   * file was uploaded but the page didn't retain an object URL —
   * "No image uploaded yet." would mislead the reviewer.
   */
  emptyMessage?: string;
}

/**
 * Image preview with an optional SVG bbox overlay.
 *
 * The bbox arrives in Tesseract's native pixel coordinates of the
 * processed (preprocessed) image. We let the SVG `viewBox` carry those
 * dimensions and stretch the SVG to fill the same box as the image — so
 * the rectangle scales naturally with whatever container width Tailwind
 * gives us.
 */
export function LabelImagePreview({
  src,
  alt,
  bbox,
  className,
  emptyMessage = "No image uploaded yet.",
}: LabelImagePreviewProps) {
  if (!src) {
    return (
      <div
        className={cn(
          "border-border bg-muted/30 text-muted-foreground flex aspect-[4/5] items-center justify-center rounded-xl border border-dashed p-4 text-center text-sm",
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-border bg-muted/20 relative overflow-hidden rounded-xl border",
        className,
      )}
    >
      {/* Using a plain <img/> instead of next/image — the source can be a
          blob: URL (camera capture) or any reviewer-supplied data URL,
          which next/image's loader does not support. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="block h-auto w-full select-none"
        draggable={false}
      />
      {bbox ? (
        <svg
          data-testid="bbox-overlay"
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${bbox.imageWidth} ${bbox.imageHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect
            data-testid="bbox-polygon"
            x={bbox.x0}
            y={bbox.y0}
            width={Math.max(1, bbox.x1 - bbox.x0)}
            height={Math.max(1, bbox.y1 - bbox.y0)}
            fill="rgba(250, 204, 21, 0.20)"
            stroke="rgb(250, 204, 21)"
            strokeWidth={4}
            rx={4}
            ry={4}
          />
        </svg>
      ) : null}
    </div>
  );
}
