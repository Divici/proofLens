"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CircleCheck,
  Clock,
  Eye,
  Loader2,
  RefreshCw,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import type { ApplicationData, BeverageType } from "@/lib/ai/schema";
import type { OverallStatus } from "@/lib/verify/types";
import type { ExtractLabelResponseShape } from "@/lib/workers/extract-worker";

/**
 * Per-row state machine. Each row moves through:
 *   queued → processing → (complete | failed)
 * Reviewer can retry from `failed` and the row re-enters `queued`.
 */
export type BatchRowStatus =
  | "queued"
  | "processing"
  | "complete"
  | "failed";

export interface BatchQueueItem {
  id: string;
  filename: string;
  brand: string;
  beverageType: BeverageType;
  status: BatchRowStatus;
  overall: OverallStatus | null;
  errorMessage: string | null;
  processingTimeMs: number;
  /**
   * True when the row has at least one strict-fail in its FieldResult[].
   * Distinct from `overall === "fail"` — pass-with-warnings rows can
   * carry a warning that the reviewer wants to filter on.
   */
  hasFailures: boolean;
  hasOverrides: boolean;
  expected: ApplicationData;
  /** Full response payload — null until extraction completes. */
  response: ExtractLabelResponseShape | null;
}

export interface BatchQueueProps {
  items: ReadonlyArray<BatchQueueItem>;
  onRetryFailed: (id: string) => void;
  onRetryAll: () => void;
  onOpenDetail: (id: string) => void;
}

type StatusFilter =
  | "all"
  | "queued"
  | "processing"
  | "complete"
  | "failed-only"
  | "has-failures"
  | "overridden-only";

const STATUS_FILTERS: ReadonlyArray<{
  key: StatusFilter;
  label: string;
}> = [
  { key: "all", label: "All" },
  { key: "queued", label: "Queued" },
  { key: "processing", label: "Processing" },
  { key: "complete", label: "Complete" },
  { key: "failed-only", label: "Failed only" },
  { key: "has-failures", label: "Has failures" },
  { key: "overridden-only", label: "Overridden only" },
];

const STATUS_VISUALS: Record<
  BatchRowStatus,
  { Icon: LucideIcon; label: string; tone: string }
> = {
  queued: {
    Icon: Clock,
    label: "Queued",
    tone: "bg-muted text-muted-foreground",
  },
  processing: {
    Icon: Loader2,
    label: "Processing",
    tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  complete: {
    Icon: CircleCheck,
    label: "Complete",
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  failed: {
    Icon: XCircle,
    label: "Failed",
    tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
};

const OVERALL_TONE: Record<OverallStatus, string> = {
  pass: "text-emerald-700 dark:text-emerald-300",
  "pass-with-warnings": "text-sky-700 dark:text-sky-300",
  fail: "text-rose-700 dark:text-rose-300",
  "needs-manual-review": "text-violet-700 dark:text-violet-300",
  "request-better-image": "text-orange-700 dark:text-orange-300",
};

const OVERALL_LABEL: Record<OverallStatus, string> = {
  pass: "Pass",
  "pass-with-warnings": "Pass + warnings",
  fail: "Fail",
  "needs-manual-review": "Manual review",
  "request-better-image": "Request better image",
};

export function BatchQueue({
  items,
  onRetryFailed,
  onRetryAll,
  onOpenDetail,
}: BatchQueueProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [beverageFilter, setBeverageFilter] = useState<"all" | BeverageType>(
    "all",
  );

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (beverageFilter !== "all" && item.beverageType !== beverageFilter) {
        return false;
      }
      switch (statusFilter) {
        case "all":
          return true;
        case "queued":
          return item.status === "queued";
        case "processing":
          return item.status === "processing";
        case "complete":
          return item.status === "complete";
        case "failed-only":
          return item.status === "failed";
        case "has-failures":
          return item.hasFailures || item.overall === "fail";
        case "overridden-only":
          return item.hasOverrides;
      }
    });
  }, [items, statusFilter, beverageFilter]);

  const failedCount = items.filter((i) => i.status === "failed").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Status filter"
        >
          {STATUS_FILTERS.map((opt) => (
            <Button
              key={opt.key}
              type="button"
              variant={statusFilter === opt.key ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(opt.key)}
            >
              {opt.label}
            </Button>
          ))}
          <label
            htmlFor="batch-beverage-filter"
            className="ml-2 text-xs text-muted-foreground"
          >
            Beverage:
          </label>
          <select
            id="batch-beverage-filter"
            aria-label="Beverage filter"
            value={beverageFilter}
            onChange={(e) =>
              setBeverageFilter(e.target.value as "all" | BeverageType)
            }
            className="border-input rounded-md border bg-background px-2 py-1 text-xs"
          >
            <option value="all">all</option>
            <option value="distilled-spirits">distilled-spirits</option>
            <option value="wine">wine</option>
            <option value="malt-beverage">malt-beverage</option>
            <option value="unknown">unknown</option>
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetryAll}
          disabled={failedCount === 0}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Retry all failed{failedCount > 0 ? ` (${failedCount})` : ""}
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">
            No rows match the active filter.
          </p>
        ) : (
          <ul role="list" className="divide-border divide-y">
            {filtered.map((item) => {
              const visual = STATUS_VISUALS[item.status];
              const StatusIcon = visual.Icon;
              return (
                <li
                  key={item.id}
                  data-testid="batch-queue-row"
                  className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          visual.tone,
                        )}
                      >
                        <StatusIcon
                          aria-hidden="true"
                          className={cn(
                            "size-3",
                            item.status === "processing" && "animate-spin",
                          )}
                        />
                        {visual.label}
                      </span>
                      {item.overall ? (
                        <span
                          className={cn(
                            "text-xs font-medium",
                            OVERALL_TONE[item.overall],
                          )}
                        >
                          {OVERALL_LABEL[item.overall]}
                        </span>
                      ) : null}
                      {item.hasOverrides ? (
                        <span
                          className="text-violet-700 dark:text-violet-300 inline-flex items-center gap-0.5 text-[11px] font-medium"
                          aria-label="Has reviewer overrides"
                          data-testid="row-override-badge"
                        >
                          <Eye className="size-3" aria-hidden="true" />
                          override
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenDetail(item.id)}
                      aria-label={`Open ${item.filename}`}
                      className="mt-1 block max-w-full truncate text-left text-sm font-medium text-foreground hover:underline"
                      disabled={item.status !== "complete"}
                    >
                      {item.brand}{" "}
                      <span className="text-muted-foreground font-normal">
                        — {item.filename}
                      </span>
                    </button>
                    {item.errorMessage ? (
                      <p className="text-rose-700 dark:text-rose-300 mt-1 flex items-center gap-1 text-xs">
                        <AlertTriangle className="size-3" aria-hidden="true" />
                        {item.errorMessage}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {item.status === "complete"
                        ? `${(item.processingTimeMs / 1000).toFixed(1)} s`
                        : ""}
                    </span>
                    {item.status === "failed" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onRetryFailed(item.id)}
                        aria-label={`Retry ${item.filename}`}
                      >
                        <RefreshCw className="size-4" aria-hidden="true" />
                        Retry
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
