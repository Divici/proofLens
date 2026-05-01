"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Download, FileText, ImagePlus, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import {
  estimateCostUsd,
  estimateDurationMs,
  formatEta,
  HARD_CAP,
  POOL_CONCURRENCY,
  SOFT_WARN_THRESHOLD,
} from "@/lib/batch/state";
import type { ExpectedRow } from "@/lib/batch/pair";

export interface BatchDropzoneProps {
  labels: ReadonlyArray<File>;
  pairedRows: ReadonlyArray<ExpectedRow>;
  warnings: ReadonlyArray<string>;
  onLabelsAdded: (files: File[]) => void;
  /** Receives the raw text and the inferred kind (csv | json). */
  onPairedTextLoaded: (text: string, kind: "csv" | "json") => void;
  onClear: () => void;
  onStart: () => void;
  starting: boolean;
  /** Used by the "Load demo batch" affordance on /batch (track 6). */
  onLoadDemo?: () => void;
  /**
   * When non-null, disables the Start button and surfaces this string as a
   * native tooltip. Used by the parent to gate the run on prerequisites
   * the dropzone doesn't own (e.g. reviewer name).
   */
  startDisabledReason?: string | null;
}

/**
 * Two-zone dropzone for batch flow:
 *  • Labels — multi-select images
 *  • Paired data — CSV / JSON file or drag-drop
 *
 * The Start button fires a soft confirmation modal at ≥50 files
 * (cost+ETA estimate) and a trim modal when the drop overflows the
 * hard cap of 250.
 */
export function BatchDropzone({
  labels,
  pairedRows,
  warnings,
  onLabelsAdded,
  onPairedTextLoaded,
  onClear,
  onStart,
  starting,
  onLoadDemo,
  startDisabledReason = null,
}: BatchDropzoneProps) {
  const labelsInputId = useId();
  const pairedInputId = useId();
  const labelsInputRef = useRef<HTMLInputElement | null>(null);
  const pairedInputRef = useRef<HTMLInputElement | null>(null);

  const [confirmModal, setConfirmModal] = useState<null | "start">(null);
  const [trimModal, setTrimModal] = useState<null | {
    files: File[];
  }>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLabelsAccepted = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return;
      const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (arr.length === 0) {
        setError("Please drop image files (JPEG, PNG, WEBP).");
        return;
      }
      setError(null);
      const projectedTotal = labels.length + arr.length;
      if (projectedTotal > HARD_CAP) {
        setTrimModal({ files: arr });
        return;
      }
      onLabelsAdded(arr);
    },
    [labels.length, onLabelsAdded],
  );

  const handlePairedFile = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      const ext = file.name.split(".").pop()?.toLowerCase();
      const kind: "csv" | "json" =
        ext === "json" || file.type === "application/json" ? "json" : "csv";
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        onPairedTextLoaded(text, kind);
      };
      reader.onerror = () => {
        setError("Could not read the paired data file.");
      };
      reader.readAsText(file);
    },
    [onPairedTextLoaded],
  );

  const handleStartClick = () => {
    if (labels.length >= SOFT_WARN_THRESHOLD) {
      setConfirmModal("start");
    } else {
      onStart();
    }
  };

  const acceptTrim = () => {
    if (!trimModal) return;
    const remaining = HARD_CAP - labels.length;
    const trimmed = trimModal.files.slice(0, Math.max(0, remaining));
    onLabelsAdded(trimmed);
    setTrimModal(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Labels dropzone */}
        <div
          aria-label="Upload label files"
          className={cn(
            "flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card/40 p-6 text-center transition-colors hover:bg-muted/40",
          )}
          role="region"
          onClick={() => labelsInputRef.current?.click()}
          onDrop={(e) => {
            e.preventDefault();
            handleLabelsAccepted(e.dataTransfer?.files ?? null);
          }}
          onDragOver={(e) => e.preventDefault()}
          data-testid="batch-dropzone-labels"
        >
          <div className="rounded-full bg-muted p-3 text-muted-foreground">
            <UploadCloud className="size-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Drop label images here, or click to choose
            </p>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, WEBP. Soft warn at {SOFT_WARN_THRESHOLD}, hard cap{" "}
              {HARD_CAP}.
            </p>
            <p className="mt-1 text-xs">
              <span className="font-medium text-foreground">
                {labels.length}
              </span>{" "}
              / {HARD_CAP} labels queued
            </p>
          </div>
          <input
            ref={labelsInputRef}
            id={labelsInputId}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              handleLabelsAccepted(e.target.files);
              e.target.value = "";
            }}
            aria-label="Label files input"
          />
        </div>

        {/* Paired data dropzone */}
        <div
          aria-label="Upload paired CSV or JSON"
          className={cn(
            "flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card/40 p-6 text-center transition-colors hover:bg-muted/40",
          )}
          role="region"
          onClick={() => pairedInputRef.current?.click()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer?.files?.[0];
            handlePairedFile(file);
          }}
          onDragOver={(e) => e.preventDefault()}
          data-testid="batch-dropzone-paired"
        >
          <div className="rounded-full bg-muted p-3 text-muted-foreground">
            <FileText className="size-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Drop paired CSV or JSON, or click to choose
            </p>
            <p className="text-xs text-muted-foreground">
              CSV columns: filename, brand, classType, abv, …{" "}
              <a
                href="/api/template/csv"
                className="underline hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
                download="prooflens-batch-template.csv"
              >
                Download template
              </a>
            </p>
            <p className="mt-1 text-xs">
              <span className="font-medium text-foreground">
                {pairedRows.length}
              </span>{" "}
              expected-data rows loaded
            </p>
          </div>
          <input
            ref={pairedInputRef}
            id={pairedInputId}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              handlePairedFile(file);
              e.target.value = "";
            }}
            aria-label="Paired data file input"
          />
        </div>
      </div>

      {warnings.length > 0 ? (
        <ul
          aria-label="Pairing warnings"
          className="rounded-lg border border-amber-600/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300"
        >
          {warnings.map((w) => (
            <li key={w}>• {w}</li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ImagePlus className="size-3.5" aria-hidden="true" />
          <span>
            Estimate:{" "}
            <span className="text-foreground font-medium">
              ${estimateCostUsd(labels.length).toFixed(2)}
            </span>
            {", "}
            {formatEta(estimateDurationMs(labels.length, POOL_CONCURRENCY))} ETA
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onLoadDemo ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onLoadDemo}
            >
              <Download className="size-4" aria-hidden="true" />
              Load demo batch
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={labels.length === 0 && pairedRows.length === 0}
          >
            Clear
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleStartClick}
            disabled={
              labels.length === 0 ||
              pairedRows.length === 0 ||
              starting ||
              startDisabledReason !== null
            }
            title={startDisabledReason ?? undefined}
          >
            {starting ? "Starting…" : "Start batch"}
          </Button>
        </div>
      </div>

      {confirmModal === "start" ? (
        <Modal
          title="Start large batch?"
          description={`You're about to process ${labels.length} labels. Estimate: $${estimateCostUsd(
            labels.length,
          ).toFixed(2)}, ${formatEta(
            estimateDurationMs(labels.length, POOL_CONCURRENCY),
          )} ETA. Keep this tab open until it completes.`}
          confirmLabel="Start"
          onCancel={() => setConfirmModal(null)}
          onConfirm={() => {
            setConfirmModal(null);
            onStart();
          }}
        />
      ) : null}

      {trimModal ? (
        <Modal
          title={`Drop exceeds the ${HARD_CAP}-file cap`}
          description={`You dropped ${
            trimModal.files.length
          } files; we cap batches at ${HARD_CAP} so reviewers don't lose work to a tab close. Trim to ${
            HARD_CAP - labels.length
          } files and continue?`}
          confirmLabel={`Trim to ${HARD_CAP}`}
          onCancel={() => setTrimModal(null)}
          onConfirm={acceptTrim}
        />
      ) : null}
    </div>
  );
}

interface ModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

function Modal({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: ModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-lg">
        <h2 className="text-foreground text-base font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-2 text-sm">{description}</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            data-action="cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
            data-action="confirm"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
