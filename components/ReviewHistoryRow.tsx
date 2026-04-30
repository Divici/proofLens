"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  CircleCheck,
  Eye,
  UserCog,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { Review, ReviewBeverageType } from "@/lib/storage/types";
import type { OverallStatus } from "@/lib/verify/types";
import { cn } from "@/lib/utils";

const OVERALL_LABEL: Record<
  OverallStatus,
  { label: string; tone: string; Icon: LucideIcon }
> = {
  pass: {
    label: "Pass",
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-600/30",
    Icon: CircleCheck,
  },
  "pass-with-warnings": {
    label: "Pass with warnings",
    tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-600/30",
    Icon: AlertTriangle,
  },
  fail: {
    label: "Fail",
    tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-600/30",
    Icon: XCircle,
  },
  "needs-manual-review": {
    label: "Manual review",
    tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-600/30",
    Icon: Eye,
  },
  "request-better-image": {
    label: "Better image",
    tone: "bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-orange-600/30",
    Icon: Camera,
  },
};

const BEVERAGE_LABEL: Record<ReviewBeverageType, string> = {
  spirits: "Spirits",
  wine: "Wine",
  beer: "Beer",
  unknown: "Unknown",
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export interface ReviewHistoryRowProps {
  review: Review;
  className?: string;
}

export function ReviewHistoryRow({
  review,
  className,
}: ReviewHistoryRowProps) {
  const overall = OVERALL_LABEL[review.overall];
  const thumbUrl = useMemo(
    () => URL.createObjectURL(review.thumbnail),
    [review.thumbnail],
  );

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(thumbUrl);
    };
  }, [thumbUrl]);

  const OverallIcon = overall.Icon;

  return (
    <li
      className={cn(
        "border-border bg-card/50 hover:bg-card/80 group flex items-center gap-3 rounded-lg border p-3 transition-colors",
        className,
      )}
      data-testid="review-history-row"
    >
      <div className="size-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={`Thumbnail for ${review.brand}`}
            className="size-full object-cover"
          />
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/review?reviewId=${review.id}`}
            aria-label={`Reopen ${review.brand}`}
            className="text-foreground truncate text-sm font-semibold hover:underline"
          >
            {review.brand}
          </Link>
          {review.hasOverrides ? (
            <span
              data-testid="override-indicator"
              title="Includes human override"
              className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300"
            >
              <UserCog className="size-3" aria-hidden="true" />
              Human
            </span>
          ) : null}
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
          <span>{BEVERAGE_LABEL[review.beverageType]}</span>
          <span aria-hidden="true">·</span>
          <span>{review.reviewerName}</span>
          <span aria-hidden="true">·</span>
          <span>{formatRelative(review.createdAt)}</span>
        </div>
      </div>

      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
          overall.tone,
        )}
      >
        <OverallIcon className="size-3" aria-hidden="true" />
        {overall.label}
      </span>
    </li>
  );
}
