"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Lightweight modal that shows the label artwork at full viewport size.
 * Used by the mobile-stack layout where the left-column thumbnail is
 * clamped to a thumbnail height — tap to expand fires this overlay.
 *
 * Uses the platform `<dialog>` element so we get focus-trap, Esc to
 * close, and aria-modal semantics for free without pulling in a
 * Dialog dep.
 */

export interface ImageLightboxProps {
  open: boolean;
  src: string | null;
  alt: string;
  onClose: () => void;
}

export function ImageLightbox({ open, src, alt, onClose }: ImageLightboxProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="Label artwork"
      onClose={onClose}
      onClick={(e) => {
        // Click on the backdrop (outside the inner content) closes the
        // dialog. The inner figure swallows clicks via stopPropagation.
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 max-h-screen max-w-screen-xl rounded-xl bg-background p-0 backdrop:bg-black/70"
    >
      <div className="relative flex max-h-[90vh] max-w-[90vw] flex-col">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close image"
          className="bg-background/90 hover:bg-background absolute right-2 top-2 z-10 inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-border shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="block max-h-[90vh] max-w-[90vw] object-contain"
          />
        ) : null}
      </div>
    </dialog>
  );
}
