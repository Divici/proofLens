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

const STATUS_VISUALS: Record<FieldStatus, StatusVisual> = {
  pass: {
    label: "Pass",
    badgeClass:
      "bg-emerald-500/10 text-emerald-700 ring-emerald-600/30 dark:text-emerald-300",
    Icon: CircleCheck,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    testId: "status-icon-pass",
  },
  "likely-match": {
    label: "Likely match",
    badgeClass:
      "bg-sky-500/10 text-sky-700 ring-sky-600/30 dark:text-sky-300",
    Icon: Check,
    iconClass: "text-sky-600 dark:text-sky-400",
    testId: "status-icon-likely-match",
  },
  warning: {
    label: "Warning",
    badgeClass:
      "bg-amber-500/10 text-amber-700 ring-amber-600/30 dark:text-amber-300",
    Icon: AlertTriangle,
    iconClass: "text-amber-600 dark:text-amber-400",
    testId: "status-icon-warning",
  },
  fail: {
    label: "Fail",
    badgeClass:
      "bg-rose-500/10 text-rose-700 ring-rose-600/30 dark:text-rose-300",
    Icon: XCircle,
    iconClass: "text-rose-600 dark:text-rose-400",
    testId: "status-icon-fail",
  },
  missing: {
    label: "Missing",
    badgeClass:
      "bg-zinc-500/10 text-zinc-700 ring-zinc-600/30 dark:text-zinc-300",
    Icon: CircleSlash,
    iconClass: "text-zinc-500",
    testId: "status-icon-missing",
  },
  "low-confidence": {
    label: "Low confidence",
    badgeClass:
      "bg-orange-500/10 text-orange-700 ring-orange-600/30 dark:text-orange-300",
    Icon: CircleAlert,
    iconClass: "text-orange-500",
    testId: "status-icon-low-confidence",
  },
  "manual-review": {
    label: "Manual review",
    badgeClass:
      "bg-violet-500/10 text-violet-700 ring-violet-600/30 dark:text-violet-300",
    Icon: Eye,
    iconClass: "text-violet-600 dark:text-violet-400",
    testId: "status-icon-manual-review",
  },
  "not-required": {
    label: "Not required",
    badgeClass:
      "bg-muted text-muted-foreground ring-border",
    Icon: CircleHelp,
    iconClass: "text-muted-foreground",
    testId: "status-icon-not-required",
  },
};

function renderValue(value: FieldResult["value"]): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">Not visible</span>;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function renderExpected(value: FieldResult["expected"]): React.ReactNode {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

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
  const expected = renderExpected(result.expected);
  const overrideEnabled = onOverrideSave !== undefined;

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
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
              visual.badgeClass,
            )}
          >
            {visual.label}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <div className="text-foreground text-sm">
            {renderValue(result.value)}
          </div>
          {expected !== null && expected !== "" ? (
            <div className="text-muted-foreground text-xs">
              Expected: <span className="text-foreground/80">{expected}</span>
            </div>
          ) : null}
        </div>

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
