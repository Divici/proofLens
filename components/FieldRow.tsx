"use client";

import {
  Check,
  AlertTriangle,
  XCircle,
  CircleHelp,
  Eye,
  CircleAlert,
  CircleSlash,
  CircleCheck,
  UserCog,
} from "lucide-react";
import type {
  FieldOverride,
  FieldResult,
  FieldStatus,
} from "@/lib/verify/types";
import { HumanOverridePanel } from "./HumanOverridePanel";
import { FieldComparison } from "./FieldComparison";
import { cn } from "@/lib/utils";

export interface FieldRowProps {
  result: FieldResult;
  onSelect: (field: string) => void;
  selected: boolean;
  /** Optional override controls — when provided, an "Override" toggle appears. */
  reviewerName?: string;
  onOverrideSave?: (field: string, override: FieldOverride) => void;
  onOverrideClear?: (field: string) => void;
}

interface StatusVisual {
  label: string;
  badgeClass: string;
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  iconClass: string;
  testId: string;
}

// Pill palette mirrors the Phase-9 design language: solid pastel
// background + saturated text, no ring border. Calmer than the previous
// ring-inset look and more readable on the new white-card surfaces.
const STATUS_VISUALS: Record<FieldStatus, StatusVisual> = {
  pass: {
    // "Pass" everywhere — strict and nuanced. The strict-vs-nuanced
    // split is internal architecture; the reviewer-facing vocabulary
    // is one word, matching the overall verdict pill.
    label: "Pass",
    badgeClass:
      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    Icon: CircleCheck,
    iconClass: "text-green-600 dark:text-green-400",
    testId: "status-icon-pass",
  },
  "likely-match": {
    label: "Likely match",
    badgeClass:
      "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    Icon: Check,
    iconClass: "text-sky-600 dark:text-sky-400",
    testId: "status-icon-likely-match",
  },
  warning: {
    // "Warning" matches the underlying FieldStatus enum value; the
    // previous "Flagged" label drifted from the codebase's vocabulary.
    label: "Warning",
    badgeClass:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    Icon: AlertTriangle,
    iconClass: "text-yellow-600 dark:text-yellow-400",
    testId: "status-icon-warning",
  },
  fail: {
    label: "Fail",
    badgeClass:
      "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    Icon: XCircle,
    iconClass: "text-red-600 dark:text-red-400",
    testId: "status-icon-fail",
  },
  missing: {
    label: "Missing",
    badgeClass:
      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    Icon: CircleSlash,
    iconClass: "text-gray-500",
    testId: "status-icon-missing",
  },
  "low-confidence": {
    label: "Low confidence",
    badgeClass:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    Icon: CircleAlert,
    iconClass: "text-orange-500",
    testId: "status-icon-low-confidence",
  },
  "manual-review": {
    label: "Manual review",
    badgeClass:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    Icon: Eye,
    iconClass: "text-purple-600 dark:text-purple-400",
    testId: "status-icon-manual-review",
  },
  "not-required": {
    label: "Not required",
    badgeClass:
      "bg-muted text-muted-foreground",
    Icon: CircleHelp,
    iconClass: "text-muted-foreground",
    testId: "status-icon-not-required",
  },
};

export function FieldRow({
  result,
  onSelect,
  selected,
  reviewerName,
  onOverrideSave,
  onOverrideClear,
}: FieldRowProps) {
  const override = result.humanOverride;
  const visualStatus: FieldStatus = override?.humanStatus ?? result.status;
  const visual = STATUS_VISUALS[visualStatus];
  const { Icon } = visual;
  const overrideEnabled = onOverrideSave !== undefined;
  // Render the Expected vs Extracted block whenever either side has a
  // value. "not-required" rows (e.g., wine ABV ≤ 14 % missing) typically
  // have no expected and no extracted — skip them so the row doesn't
  // grow with empty placeholders.
  const showComparison =
    !(result.value === null && result.expected === null);

  return (
    <div
      className={cn(
        "flex flex-col",
        override
          ? "border-l-4 border-violet-500 bg-violet-500/5"
          : null,
      )}
      data-status={visualStatus}
      data-overridden={override ? "true" : "false"}
    >
      <button
        type="button"
        onClick={() => onSelect(result.field)}
        aria-pressed={selected}
        aria-expanded={selected}
        data-status={visualStatus}
        className={cn(
          "group flex w-full flex-col items-stretch gap-2 px-4 py-3 text-left transition-colors",
          "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected && "bg-muted/70",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon
              className={cn("size-4 shrink-0", visual.iconClass)}
              aria-hidden={true}
              data-testid={visual.testId}
            />
            <span className="text-foreground/90 text-xs font-semibold uppercase tracking-wide">
              {result.label}
            </span>
            {override ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300"
                title="Human override applied"
                data-testid="override-indicator"
              >
                <UserCog className="size-3" aria-hidden="true" />
                Human
              </span>
            ) : null}
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
              visual.badgeClass,
            )}
          >
            {visual.label}
          </span>
        </div>

        {showComparison ? (
          <FieldComparison
            expected={result.expected}
            extracted={result.value}
          />
        ) : null}

        <p className="text-muted-foreground text-xs leading-relaxed">
          {result.explanation}
        </p>

        {override ? (
          <p className="text-violet-700 dark:text-violet-300 text-[11px] italic">
            Override note: “{override.reason}” — {override.reviewerName}
          </p>
        ) : null}

        {result.evidenceQuote ? (
          <div className="text-muted-foreground border-l-2 border-border pl-2 text-[11px] italic">
            “{result.evidenceQuote}”
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground">
          <span>{result.suggestedAction}</span>
          <span>Confidence: {Math.round(result.confidence * 100)}%</span>
        </div>
      </button>

      {selected && overrideEnabled ? (
        <div className="px-4 pb-3">
          <HumanOverridePanel
            fieldLabel={result.label}
            fieldKey={result.field}
            originalAiStatus={override?.originalAiStatus ?? result.status}
            reviewerName={reviewerName ?? ""}
            existingOverride={override}
            onSave={(payload) => onOverrideSave!(result.field, payload)}
            onClear={
              onOverrideClear
                ? () => onOverrideClear(result.field)
                : undefined
            }
          />
        </div>
      ) : null}
    </div>
  );
}
