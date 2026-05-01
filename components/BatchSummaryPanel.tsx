"use client";

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { formatEta } from "@/lib/batch/state";
import type { BatchSummary } from "@/lib/storage/types";
import { cn } from "@/lib/utils";

export interface BatchSummaryPanelProps {
  summary: BatchSummary;
  /** Files completed (or failed) so far. */
  completed: number;
  /** Total files in the batch. */
  total: number;
  running: boolean;
  className?: string;
}

/**
 * PRD §9.2 batch summary tile grid + progress bar. Designed for live
 * updates — `completed` ticks up as workers finish so reviewers see
 * progress without polling the queue table.
 */
export function BatchSummaryPanel({
  summary,
  completed,
  total,
  running,
  className,
}: BatchSummaryPanelProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span>Batch summary</span>
          <span className="text-muted-foreground text-xs font-normal">
            {completed} / {total} processed
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-4">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={completed}
          aria-label="Batch progress"
          className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
              running ? "bg-sky-500" : "bg-emerald-500",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <Tile label="Total" value={summary.total} />
          <Tile label="Passed" value={summary.pass} tone="emerald" />
          <Tile label="Pass + warnings" value={summary.passWithWarnings} tone="sky" />
          <Tile label="Failed" value={summary.fail} tone="rose" />
          <Tile label="Manual review" value={summary.needsManualReview} tone="violet" />
          <Tile
            label="Better image"
            value={summary.requestBetterImage}
            tone="orange"
          />
          <Tile
            label="Quality issues"
            value={summary.qualityIssues}
            tone="amber"
          />
          <Tile
            label="Failures"
            value={summary.failures}
            tone={summary.failures > 0 ? "rose" : "neutral"}
          />
          <Tile
            label="Avg time"
            value={
              summary.avgProcessingTimeMs === 0
                ? "—"
                : `${(summary.avgProcessingTimeMs / 1000).toFixed(1)} s`
            }
          />
          <Tile
            label="Total time"
            value={
              summary.totalDurationMs === 0
                ? "—"
                : formatEta(summary.totalDurationMs).replace(/^~/, "")
            }
          />
        </dl>
      </CardContent>
    </Card>
  );
}

interface TileProps {
  label: string;
  value: number | string;
  tone?: "neutral" | "emerald" | "sky" | "rose" | "violet" | "orange" | "amber";
}

function Tile({ label, value, tone = "neutral" }: TileProps) {
  const toneClass = {
    neutral: "text-foreground",
    emerald: "text-emerald-700 dark:text-emerald-300",
    sky: "text-sky-700 dark:text-sky-300",
    rose: "text-rose-700 dark:text-rose-300",
    violet: "text-violet-700 dark:text-violet-300",
    orange: "text-orange-700 dark:text-orange-300",
    amber: "text-amber-700 dark:text-amber-300",
  }[tone];
  return (
    <div className="border-border/40 rounded-lg border bg-muted/20 p-2">
      <dt className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
        {label}
      </dt>
      <dd className={cn("text-base font-semibold", toneClass)}>{value}</dd>
    </div>
  );
}
