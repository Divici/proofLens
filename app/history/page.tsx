"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { ReviewHistoryList } from "@/components/ReviewHistoryList";
import { listReviews } from "@/lib/storage/review-repo";
import { getQuotaStatus, isQuotaWarning } from "@/lib/storage/quota";
import type { Review } from "@/lib/storage/types";

type LoadStatus =
  | { kind: "loading" }
  | { kind: "ready"; reviews: Review[] }
  | { kind: "error"; message: string };

export default function HistoryPage() {
  const [status, setStatus] = useState<LoadStatus>({ kind: "loading" });
  const [quota, setQuota] = useState<{ percentage: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listReviews()
      .then((reviews) => {
        if (!cancelled) setStatus({ kind: "ready", reviews });
      })
      .catch((cause) => {
        if (cancelled) return;
        console.error("[history] failed to load reviews", cause);
        setStatus({
          kind: "error",
          message:
            "We couldn't read your local history. Check that your browser allows IndexedDB.",
        });
      });
    getQuotaStatus()
      .then((q) => {
        if (cancelled) return;
        setQuota(isQuotaWarning(q) ? { percentage: q.percentage } : null);
      })
      .catch(() => {
        // Quota is informational; ignore failures.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SiteNav />
      <main
        id="main"
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6"
      >
        <div className="flex flex-col gap-3">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
          >
            <ArrowLeft className="size-3.5" /> Back to home
          </Link>
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">
              Review history
            </h1>
            <p className="text-muted-foreground text-sm">
              Everything you save lives in this browser only. No server-side
              copy is kept (per the IT note).
            </p>
          </div>
        </div>

        {quota ? (
          <div
            role="status"
            aria-label="Storage quota warning"
            className="border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-start gap-2 rounded-xl border px-4 py-3 text-xs"
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              History is nearly full ({quota.percentage.toFixed(1)}% used).
              Export and clear before adding many more reviews.
            </span>
          </div>
        ) : null}

        {status.kind === "loading" ? (
          <div className="text-muted-foreground text-sm">
            Loading saved reviews…
          </div>
        ) : null}

        {status.kind === "error" ? (
          <div
            role="alert"
            className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2 rounded-xl border p-4 text-sm"
          >
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            <span>{status.message}</span>
          </div>
        ) : null}

        {status.kind === "ready" ? (
          <ReviewHistoryList reviews={status.reviews} />
        ) : null}
      </main>
    </>
  );
}
