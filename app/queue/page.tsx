"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import {
  listApplications,
  type QueuedApplication,
} from "@/lib/queue/applications";
import { listReviews } from "@/lib/storage/review-repo";

/**
 * Queue page — the new home of proofLens.
 *
 * `PROJECT_BRIEF.md` (Sarah Chen, Deputy Director):
 *   "An agent pulls up an application, looks at the label artwork, and
 *    checks that what's on the label matches what's in the application."
 * That assumes the work is already in front of the agent — Sarah's
 * "agents drowning in routine stuff" and Janet's "200, 300 label
 * applications at once" both imply a queue. This page synthesizes that
 * queue from `DEMO_SCENARIOS` (placeholder artwork) and `REAL_SCENARIOS`
 * (real bottle photos including image-quality variants), and clicking a
 * row opens `/review` with both the image and form pre-loaded — the
 * data was "already on file in COLA" in the brief's workflow.
 */

interface ReviewedStatus {
  /** Set of scenarioIds that have at least one saved review. */
  reviewedScenarioIds: Set<string>;
  ready: boolean;
}

function useReviewedScenarios(): ReviewedStatus {
  const [reviewedScenarioIds, setReviewed] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listReviews()
      .then((reviews) => {
        if (cancelled) return;
        const ids = new Set<string>();
        for (const r of reviews) {
          if (r.scenarioId) ids.add(r.scenarioId);
        }
        setReviewed(ids);
        setReady(true);
      })
      .catch((cause) => {
        // IndexedDB unavailable → treat every row as Pending so the
        // queue still renders. Don't crash.
        console.warn("[queue] failed to read review history", cause);
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { reviewedScenarioIds, ready };
}

export default function QueuePage() {
  const applications = useMemo<QueuedApplication[]>(
    () => listApplications(),
    [],
  );
  const { reviewedScenarioIds, ready } = useReviewedScenarios();

  return (
    <>
      <SiteNav />
      <main
        id="main"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6"
      >
        <header className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs tracking-wider uppercase">
            Application queue
          </p>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Pending applications
          </h1>
          <p className="text-muted-foreground text-sm">
            Click a row to open Active Review with the artwork and
            application data pre-loaded. Reviewer progress is saved in
            this browser only.
          </p>
        </header>

        {applications.length === 0 ? (
          <EmptyState />
        ) : (
          <ApplicationTable
            applications={applications}
            reviewedScenarioIds={reviewedScenarioIds}
            statusReady={ready}
          />
        )}
      </main>
    </>
  );
}

function EmptyState() {
  return (
    <div
      role="status"
      className="text-muted-foreground rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm"
    >
      No pending applications. Drop a batch CSV in /batch to add reviews
      to your queue.
    </div>
  );
}

interface ApplicationTableProps {
  applications: QueuedApplication[];
  reviewedScenarioIds: Set<string>;
  statusReady: boolean;
}

const COLUMN_GRID =
  "grid grid-cols-[7.5rem_minmax(8rem,1fr)_minmax(7rem,1fr)_5.5rem_minmax(10rem,2fr)_6.5rem_2.5rem]";

function ApplicationTable({
  applications,
  reviewedScenarioIds,
  statusReady,
}: ApplicationTableProps) {
  return (
    <div className="border-border/60 rounded-xl border overflow-hidden">
      <div
        className={`${COLUMN_GRID} bg-muted/40 border-b border-border/60 text-muted-foreground text-[11px] font-medium uppercase tracking-wider hidden sm:grid`}
        role="row"
      >
        <div className="px-4 py-3">APP-ID</div>
        <div className="px-4 py-3">Brand</div>
        <div className="px-4 py-3">Beverage</div>
        <div className="px-4 py-3">Source</div>
        <div className="px-4 py-3">Description</div>
        <div className="px-4 py-3">Status</div>
        <div className="px-4 py-3 sr-only">Open</div>
      </div>
      <ul className="divide-y divide-border/60">
        {applications.map((app) => (
          <ApplicationRow
            key={app.applicationId}
            application={app}
            reviewed={reviewedScenarioIds.has(app.scenarioId)}
            statusReady={statusReady}
          />
        ))}
      </ul>
    </div>
  );
}

interface ApplicationRowProps {
  application: QueuedApplication;
  reviewed: boolean;
  statusReady: boolean;
}

function ApplicationRow({
  application,
  reviewed,
  statusReady,
}: ApplicationRowProps) {
  const href = `/review?scenario=${encodeURIComponent(application.scenarioId)}`;
  const ariaLabel = `Open review for ${application.applicationId} — ${application.brand}`;

  return (
    <li>
      <Link
        href={href}
        aria-label={ariaLabel}
        className={`${COLUMN_GRID} bg-background hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors items-center grid-cols-1 sm:grid`}
      >
        <Cell label="APP-ID">
          <span className="font-mono text-xs text-foreground">
            {application.applicationId}
          </span>
        </Cell>
        <Cell label="Brand">
          <span className="text-sm font-medium text-foreground">
            {application.brand}
          </span>
        </Cell>
        <Cell label="Beverage">
          <span className="text-sm text-muted-foreground">
            {application.beverageType}
          </span>
        </Cell>
        <Cell label="Source">
          <SourcePill source={application.source} />
        </Cell>
        <Cell label="Description">
          <span className="text-sm text-muted-foreground line-clamp-2">
            {application.description}
          </span>
        </Cell>
        <Cell label="Status">
          <ReviewedPill
            reviewed={reviewed}
            ready={statusReady}
          />
        </Cell>
        <Cell label="Open">
          <ArrowRight
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
        </Cell>
      </Link>
    </li>
  );
}

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 flex items-center gap-2 sm:gap-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium sm:hidden min-w-[5.5rem]">
        {label}
      </span>
      <span className="flex-1 sm:flex-none">{children}</span>
    </div>
  );
}

function SourcePill({ source }: { source: "synthetic" | "real" }) {
  if (source === "real") {
    return (
      <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 px-2 py-0.5 text-[11px] font-medium">
        Real photo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-500/15 text-gray-700 dark:text-gray-300 px-2 py-0.5 text-[11px] font-medium">
      Synthetic
    </span>
  );
}

function ReviewedPill({
  reviewed,
  ready,
}: {
  reviewed: boolean;
  ready: boolean;
}) {
  if (!ready) {
    return (
      <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[11px] font-medium">
        …
      </span>
    );
  }
  if (reviewed) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium">
        Reviewed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">
      Pending
    </span>
  );
}

