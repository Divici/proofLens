"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import { VerificationDetail } from "./VerificationDetail";
import type { BatchQueueItem } from "./BatchQueue";
import { toReviewBeverageType } from "@/lib/storage/types";

export interface BatchDetailModalProps {
  item: BatchQueueItem | null;
  onClose: () => void;
}

/**
 * Per-label drill-in modal. Embeds the same `VerificationDetail` that
 * the single-review page uses so reviewers see the full FieldResult[] +
 * bbox overlay + image-quality banner without leaving /batch.
 *
 * No image src — batch flow runs against `File`s the page hands to the
 * pool but doesn't keep around as object URLs (memory pressure with 250
 * files). A future slice can wire previews in.
 */
export function BatchDetailModal({ item, onClose }: BatchDetailModalProps) {
  useEffect(() => {
    if (!item) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detail for ${item.filename}`}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-xl border border-border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-foreground text-base font-semibold">
              {item.brand}
            </h2>
            <p className="text-muted-foreground text-xs">{item.filename}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close detail"
          >
            <X className="size-4" aria-hidden="true" />
            Close
          </Button>
        </div>
        {item.response ? (
          <VerificationDetail
            imageSrc={null}
            fieldResults={item.response.fieldResults}
            overall={item.response.overall}
            processingTimeMs={item.response.processingTimeMs}
            primaryUsd={item.response.aiSpend.primaryUsd}
            ocrConfidence={item.response.ocrConfidence}
            imageQualityFlags={item.response.imageQualityFlags}
            beverageType={item.expected.beverageType}
          />
        ) : (
          <p className="text-muted-foreground rounded-lg border border-dashed border-border p-6 text-center text-sm">
            This file isn&apos;t finished yet. Hold tight while the worker
            processes it.
          </p>
        )}
        {/* Surface a quick reviewer-name marker so the modal still feels
            tied to /history's audit story even though save happens on
            the page once the whole batch lands. */}
        <p className="text-muted-foreground mt-3 text-[11px]">
          Beverage type:{" "}
          <span className="text-foreground font-medium">
            {toReviewBeverageType(item.expected.beverageType)}
          </span>
        </p>
      </div>
    </div>
  );
}
