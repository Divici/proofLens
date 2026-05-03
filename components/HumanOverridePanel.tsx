"use client";

import { useState } from "react";
import { UserCog, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FieldOverride, FieldStatus } from "@/lib/verify/types";
import { cn } from "@/lib/utils";

/**
 * Per-field human-override panel (slice 0005, R-012).
 *
 * Shown inline beneath each field row when expanded. The reviewer:
 *   1. sees the original AI verdict (frozen),
 *   2. picks a new status from the 8-state enum,
 *   3. types a free-text reason (≤ 500 chars),
 *   4. clicks Save → emits the audit-record `FieldOverride` payload.
 *
 * Reviewer name is supplied from the parent (the FinalDecisionPanel owns
 * the input). Save here does NOT block on the name — the page-level save
 * handler stamps the reviewer name from the FinalDecisionPanel into any
 * override that lacks one before persisting. That keeps a single name
 * gate at the bottom of the flow rather than per-row, so the agent
 * isn't blocked from recording overrides while they're still inspecting.
 */

const STATUS_OPTIONS: ReadonlyArray<{ value: FieldStatus; label: string }> = [
  { value: "pass", label: "Pass" },
  { value: "likely-match", label: "Likely match" },
  { value: "warning", label: "Warning" },
  { value: "fail", label: "Fail" },
  { value: "missing", label: "Missing" },
  { value: "low-confidence", label: "Low confidence" },
  { value: "manual-review", label: "Manual review" },
  { value: "not-required", label: "Not required" },
];

const MAX_REASON_LENGTH = 500;

const STATUS_LABEL: Record<FieldStatus, string> = STATUS_OPTIONS.reduce(
  (acc, { value, label }) => ({ ...acc, [value]: label }),
  {} as Record<FieldStatus, string>,
);

export interface HumanOverridePanelProps {
  /** Human-readable label for this field (e.g. "Brand name"). */
  fieldLabel: string;
  /**
   * Stable field key used for `htmlFor` ids. Optional — when omitted we
   * slugify `fieldLabel`. Either way the rendered id is space-free so
   * the HTML stays valid even when reviewers add multi-word labels.
   */
  fieldKey?: string;
  originalAiStatus: FieldStatus;
  reviewerName: string;
  existingOverride?: FieldOverride;
  onSave: (override: FieldOverride) => void;
  onClear?: () => void;
  className?: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function HumanOverridePanel({
  fieldLabel,
  fieldKey,
  originalAiStatus,
  reviewerName,
  existingOverride,
  onSave,
  onClear,
  className,
}: HumanOverridePanelProps) {
  const idSlug = fieldKey?.trim() ? fieldKey : slugify(fieldLabel);
  const statusInputId = `override-status-${idSlug}`;
  const reasonInputId = `override-reason-${idSlug}`;
  const counterId = `override-counter-${idSlug}`;
  const [humanStatus, setHumanStatus] = useState<FieldStatus>(
    existingOverride?.humanStatus ?? originalAiStatus,
  );
  const [reason, setReason] = useState<string>(
    existingOverride?.reason ?? "",
  );

  const reasonEmpty = reason.trim().length === 0;
  const reasonTooLong = reason.length > MAX_REASON_LENGTH;
  // Save is allowed whenever the reviewer wrote a reason — including
  // when they kept the AI verdict (e.g. "Confirmed Pass after manual
  // zoom"). Locking save behind a status change blocks legitimate
  // re-affirmations and forces reviewers to invent a new status just to
  // record their note. Reviewer-name presence is intentionally NOT
  // checked here — see the docstring; the page-level save handler
  // stamps the name from the FinalDecisionPanel before persisting.
  const canSave = !reasonEmpty && !reasonTooLong;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      originalAiStatus,
      humanStatus,
      reason: reason.trim(),
      timestamp: new Date().toISOString(),
      reviewerName: reviewerName.trim(),
    });
  };

  return (
    <div
      className={cn(
        "border-violet-500/30 bg-violet-500/5 mt-2 flex flex-col gap-3 rounded-lg border p-3 text-left",
        className,
      )}
      data-testid="human-override-panel"
      aria-label={`Override for ${fieldLabel}`}
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-300">
        <UserCog className="size-3.5" aria-hidden="true" />
        Human override
      </div>

      <div className="text-foreground text-xs">
        <span className="text-muted-foreground">AI verdict: </span>
        <span className="font-medium">{STATUS_LABEL[originalAiStatus]}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={statusInputId}>New status</Label>
        <Select
          value={humanStatus}
          onValueChange={(value) => setHumanStatus(value as FieldStatus)}
        >
          <SelectTrigger
            id={statusInputId}
            aria-label="New status"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={reasonInputId}>Reason for override</Label>
        <Textarea
          id={reasonInputId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_REASON_LENGTH}
          placeholder="Why are you overriding the AI verdict?"
          aria-describedby={counterId}
        />
        <div
          id={counterId}
          className="text-muted-foreground text-[11px]"
        >
          {reason.length} / {MAX_REASON_LENGTH}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        {existingOverride && onClear ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setHumanStatus(originalAiStatus);
              setReason("");
              onClear();
            }}
          >
            Remove override
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={!canSave}
          onClick={handleSave}
        >
          <Save className="size-3.5" aria-hidden="true" /> Save override
        </Button>
      </div>
    </div>
  );
}
