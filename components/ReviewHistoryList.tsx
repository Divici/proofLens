"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReviewHistoryRow } from "./ReviewHistoryRow";
import type { Review, ReviewBeverageType } from "@/lib/storage/types";
import type { OverallStatus } from "@/lib/verify/types";

/**
 * Filter + search shell for the History page.
 *
 * Receives the full reviews array (already loaded from IndexedDB) and
 * narrows it client-side. The user-typed search runs over `brand` +
 * `reviewerName`. The status / beverage / overrides toggles are exclusive
 * single-value pickers (cleaner than chips at this scale).
 */

const OVERALL_OPTIONS: ReadonlyArray<{
  value: OverallStatus | "all";
  label: string;
}> = [
  { value: "all", label: "All statuses" },
  { value: "pass", label: "Pass" },
  { value: "pass-with-warnings", label: "Pass with warnings" },
  { value: "fail", label: "Fail" },
  { value: "needs-manual-review", label: "Needs manual review" },
  { value: "request-better-image", label: "Request better image" },
];

const BEVERAGE_OPTIONS: ReadonlyArray<{
  value: ReviewBeverageType | "all";
  label: string;
}> = [
  { value: "all", label: "All beverages" },
  { value: "spirits", label: "Spirits" },
  { value: "wine", label: "Wine" },
  { value: "beer", label: "Beer" },
  { value: "unknown", label: "Unknown" },
];

export interface ReviewHistoryListProps {
  reviews: ReadonlyArray<Review>;
}

export function ReviewHistoryList({ reviews }: ReviewHistoryListProps) {
  const [search, setSearch] = useState<string>("");
  const [overall, setOverall] = useState<OverallStatus | "all">("all");
  const [beverage, setBeverage] = useState<ReviewBeverageType | "all">("all");
  const [onlyOverrides, setOnlyOverrides] = useState<boolean>(false);

  // useDeferredValue keeps the input snappy while letting React skip
  // intermediate filter recomputes on fast keystrokes — no debounce
  // library needed. The input still updates synchronously.
  const deferredSearch = useDeferredValue(search);

  const filtered = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    return reviews.filter((r) => {
      if (overall !== "all" && r.overall !== overall) return false;
      if (beverage !== "all" && r.beverageType !== beverage) return false;
      if (onlyOverrides && !r.hasOverrides) return false;
      if (needle.length > 0) {
        const hay = `${r.brand} ${r.reviewerName}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [reviews, deferredSearch, overall, beverage, onlyOverrides]);

  if (reviews.length === 0) {
    return (
      <div className="border-border bg-card/40 flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center text-sm">
        <p className="text-foreground font-medium">No reviews yet.</p>
        <p className="text-muted-foreground">
          Start with{" "}
          <Link href="/review" className="text-foreground underline">
            /review
          </Link>{" "}
          or come back here after saving one.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="history-search">Search</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="text-muted-foreground absolute left-2 top-1/2 size-3.5 -translate-y-1/2"
            />
            <Input
              id="history-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Brand or reviewer name"
              className="pl-7"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="history-status">Filter by status</Label>
          <select
            id="history-status"
            value={overall}
            onChange={(e) => setOverall(e.target.value as typeof overall)}
            className="border-input bg-background h-8 rounded-lg border px-2 text-sm"
          >
            {OVERALL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="history-beverage">Filter by beverage</Label>
          <select
            id="history-beverage"
            value={beverage}
            onChange={(e) => setBeverage(e.target.value as typeof beverage)}
            className="border-input bg-background h-8 rounded-lg border px-2 text-sm"
          >
            {BEVERAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="history-only-overrides">&nbsp;</Label>
          <label className="text-muted-foreground inline-flex h-8 items-center gap-2 text-xs">
            <input
              id="history-only-overrides"
              type="checkbox"
              checked={onlyOverrides}
              onChange={(e) => setOnlyOverrides(e.target.checked)}
            />
            Only with overrides
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border-border bg-card/40 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No reviews match your filters.
        </div>
      ) : (
        <ul role="list" className="flex flex-col gap-2">
          {filtered.map((r) => (
            <ReviewHistoryRow key={r.id} review={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
