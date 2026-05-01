"use client";

import { useState, useCallback } from "react";
import { Menu } from "@base-ui/react/menu";
import { ChevronDown, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadBlob, exportPdf, exportJson, exportBatch } from "@/lib/export/client";
import type { Batch, Review } from "@/lib/storage/types";

/**
 * `<ExportMenu>` — single + batch export dropdown (R-015).
 *
 * Single mode (review-detail view):
 *   - Export → PDF (server-rendered via /api/render-pdf)
 *   - Export → JSON (browser-built deterministic envelope)
 *
 * Batch mode (post-batch summary panel):
 *   - Export → Summary CSV
 *   - Export → Per-field CSV
 *   - Export → All PDFs (zip)
 *   - Export → All JSON (zip)
 *
 * Wraps `@base-ui/react/menu` for keyboard nav + a11y. Each export
 * action shows a loading state on the trigger and emits a toast on
 * success / failure so reviewers always know whether the file landed.
 */

export type ExportMenuMode = "single" | "batch";

interface SingleProps {
  mode: "single";
  review: Review;
}

interface BatchProps {
  mode: "batch";
  batch: Batch;
  reviews: ReadonlyArray<Review>;
}

export type ExportMenuProps = (SingleProps | BatchProps) & {
  className?: string;
  /** Override app version for the rendered PDF; defaults to "0.1.0". */
  appVersion?: string;
};

export function ExportMenu(props: ExportMenuProps) {
  // Track which row is currently performing the async action. Single
  // boolean isn't enough — we need to disable every other row while one
  // is mid-flight, and we want the menu to auto-close on click so the
  // user sees the toast + spinner on the trigger rather than a hanging
  // open menu.
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const isBatch = props.mode === "batch";
  const disabled = busyRowId !== null || (isBatch && props.reviews.length === 0);

  const wrap = useCallback(
    (rowId: string, label: string, fn: () => Promise<void>) =>
      async () => {
        // Auto-close the menu immediately so the user sees the trigger's
        // spinner and any toast that follows. base-ui's `closeOnClick`
        // default already closes the popup, but we also drive `open`
        // explicitly so the controlled state stays in sync.
        setOpen(false);
        setBusyRowId(rowId);
        try {
          await fn();
          toast.success(`${label} downloaded.`);
        } catch (cause) {
          console.error(`[export] ${label} failed`, cause);
          const msg = cause instanceof Error ? cause.message : "Export failed.";
          toast.error(`Could not export ${label.toLowerCase()}: ${msg}`);
        } finally {
          setBusyRowId(null);
        }
      },
    [],
  );

  const onPdf = wrap("pdf", "PDF", async () => {
    if (props.mode !== "single") return;
    const blob = await exportPdf(props.review, props.appVersion ?? "0.1.0");
    downloadBlob(blob, suggestPdfName(props.review));
  });

  const onJson = wrap("json", "JSON", async () => {
    if (props.mode !== "single") return;
    const blob = await exportJson(props.review);
    downloadBlob(blob, suggestJsonName(props.review));
  });

  const onSummaryCsv = wrap("summary-csv", "Summary CSV", async () => {
    if (props.mode !== "batch") return;
    const blob = await exportBatch.summaryCsv(props.batch, props.reviews);
    downloadBlob(blob, suggestBatchName(props.batch, "summary", "csv"));
  });

  const onPerFieldCsv = wrap("per-field-csv", "Per-field CSV", async () => {
    if (props.mode !== "batch") return;
    const blob = await exportBatch.perFieldCsv(props.reviews);
    downloadBlob(blob, suggestBatchName(props.batch, "per-field", "csv"));
  });

  const onAllPdfs = wrap("all-pdfs-zip", "All PDFs (zip)", async () => {
    if (props.mode !== "batch") return;
    const blob = await exportBatch.allPdfsZip(
      props.reviews,
      props.appVersion ?? "0.1.0",
      props.batch.createdAt,
    );
    downloadBlob(blob, suggestBatchName(props.batch, "pdfs", "zip"));
  });

  const onAllJson = wrap("all-json-zip", "All JSON (zip)", async () => {
    if (props.mode !== "batch") return;
    const blob = await exportBatch.allJsonZip(
      props.batch,
      props.reviews,
      props.batch.createdAt,
    );
    downloadBlob(blob, suggestBatchName(props.batch, "json", "zip"));
  });

  // While ANY row is busy, every row should reject input. Used by both
  // the per-row `disabled` prop (which renders `aria-disabled="true"` and
  // blocks clicks) and the visual styling.
  const rowsLocked = busyRowId !== null;

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(props.className)}
            disabled={disabled}
            aria-label="Export"
          >
            {rowsLocked ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            <span>Export</span>
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="isolate z-50">
          <Menu.Popup className="rounded-lg border border-border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/5 p-1 min-w-44 outline-none">
            {props.mode === "single" ? (
              <>
                <MenuRow
                  label="PDF"
                  hint="Per-label audit report"
                  onSelect={onPdf}
                  disabled={rowsLocked}
                />
                <MenuRow
                  label="JSON"
                  hint="Full record + audit fields"
                  onSelect={onJson}
                  disabled={rowsLocked}
                />
              </>
            ) : (
              <>
                <MenuRow
                  label="Summary CSV"
                  hint="One row per review"
                  onSelect={onSummaryCsv}
                  disabled={rowsLocked}
                />
                <MenuRow
                  label="Per-field CSV"
                  hint="One row per (review × field)"
                  onSelect={onPerFieldCsv}
                  disabled={rowsLocked}
                />
                <MenuRow
                  label="All PDFs (zip)"
                  hint={`${props.reviews.length} PDF${props.reviews.length === 1 ? "" : "s"}`}
                  onSelect={onAllPdfs}
                  disabled={rowsLocked}
                />
                <MenuRow
                  label="All JSON (zip)"
                  hint={`${props.reviews.length} JSON file${props.reviews.length === 1 ? "" : "s"}`}
                  onSelect={onAllJson}
                  disabled={rowsLocked}
                />
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

interface MenuRowProps {
  label: string;
  hint?: string;
  onSelect: () => void;
  disabled?: boolean;
}

function MenuRow({ label, hint, onSelect, disabled = false }: MenuRowProps) {
  return (
    <Menu.Item
      onClick={onSelect}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={cn(
        "cursor-pointer flex flex-col items-start rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground",
        disabled && "cursor-not-allowed opacity-50 pointer-events-none",
      )}
    >
      <span>{label}</span>
      {hint ? (
        <span className="text-muted-foreground text-[11px]">{hint}</span>
      ) : null}
    </Menu.Item>
  );
}

function brandSlug(brand: string): string {
  return brand
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60);
}

function suggestPdfName(review: Review): string {
  return `prooflens-review-${brandSlug(review.brand) || "label"}.pdf`;
}

function suggestJsonName(review: Review): string {
  return `prooflens-review-${brandSlug(review.brand) || "label"}.json`;
}

function suggestBatchName(
  batch: Batch,
  kind: string,
  ext: string,
): string {
  const dateOnly = batch.createdAt.slice(0, 10);
  return `prooflens-batch-${dateOnly}-${batch.id.slice(0, 8)}-${kind}.${ext}`;
}
