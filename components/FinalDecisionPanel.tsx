"use client";

import { useState } from "react";
import {
  CircleCheck,
  XCircle,
  Eye,
  Camera,
  Save,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { HumanDecision } from "@/lib/storage/types";
import type { OverallStatus } from "@/lib/verify/types";
import {
  DEFAULT_OVERALL_TONE,
  OVERALL_TONES,
} from "@/lib/verify/overall-tone";
import { cn } from "@/lib/utils";

/**
 * Final-decision panel (slice 0005, R-012).
 *
 * Sits below the field results on `/review`. The reviewer:
 *   1. picks one of four decisions,
 *   2. types their name (free-text — audit field, not identity),
 *   3. types optional notes (≤ 1000 chars),
 *   4. clicks "Save review" → writes everything to IndexedDB.
 *
 * The save button is disabled until both name and decision are set.
 */

const MAX_NOTES_LENGTH = 1000;

const DECISIONS: ReadonlyArray<{
  value: HumanDecision["decision"];
  label: string;
  description: string;
  Icon: LucideIcon;
  tone: string;
}> = [
  {
    value: "approved",
    label: "Approve",
    description: "All required fields match; certificate can be issued.",
    Icon: CircleCheck,
    tone: "border-emerald-500/40 hover:bg-emerald-500/10 data-[checked=true]:bg-emerald-500/15 data-[checked=true]:border-emerald-500",
  },
  {
    value: "rejected",
    label: "Reject",
    description: "At least one mandatory rule failed.",
    Icon: XCircle,
    tone: "border-rose-500/40 hover:bg-rose-500/10 data-[checked=true]:bg-rose-500/15 data-[checked=true]:border-rose-500",
  },
  {
    value: "manual-review",
    label: "Needs manual review",
    description: "Punt to a human compliance specialist.",
    Icon: Eye,
    tone: "border-violet-500/40 hover:bg-violet-500/10 data-[checked=true]:bg-violet-500/15 data-[checked=true]:border-violet-500",
  },
  {
    value: "request-better-image",
    label: "Request better image",
    description: "Image quality is too poor to verify confidently.",
    Icon: Camera,
    tone: "border-orange-500/40 hover:bg-orange-500/10 data-[checked=true]:bg-orange-500/15 data-[checked=true]:border-orange-500",
  },
];

export interface FinalDecisionPanelProps {
  defaultReviewerName: string;
  existingDecision?: HumanDecision;
  onSave: (decision: HumanDecision) => void;
  onReviewerNameChange?: (name: string) => void;
  saving?: boolean;
  className?: string;
  /**
   * Overall verdict — colors the panel's border and surface tint to
   * match the JumpToFinalReviewButton FAB. When omitted, falls back
   * to the default (emerald) tone. See `lib/verify/overall-tone.ts`.
   */
  overall?: OverallStatus;
}

export function FinalDecisionPanel({
  defaultReviewerName,
  existingDecision,
  onSave,
  onReviewerNameChange,
  saving,
  className,
  overall,
}: FinalDecisionPanelProps) {
  const [reviewerName, setReviewerName] = useState<string>(
    existingDecision?.reviewerName ?? defaultReviewerName ?? "",
  );
  const [decision, setDecision] = useState<HumanDecision["decision"] | null>(
    existingDecision?.decision ?? null,
  );
  const [notes, setNotes] = useState<string>(existingDecision?.notes ?? "");

  const nameMissing = reviewerName.trim().length === 0;
  const decisionMissing = decision === null;
  const canSave = !nameMissing && !decisionMissing && !saving;

  const handleSave = () => {
    if (!canSave || decision === null) return;
    onSave({
      decision,
      notes: notes.trim(),
      reviewerName: reviewerName.trim(),
      timestamp: new Date().toISOString(),
    });
  };

  return (
    <div
      className={cn(
        // Border + ring + surface tint match the overall verdict so
        // the CTA-flavoured zone visually echoes the FAB and the
        // verdict pill at the top of the Results tab.
        "ring-1 flex flex-col gap-4 rounded-xl border p-4",
        (overall ? OVERALL_TONES[overall] : DEFAULT_OVERALL_TONE).border,
        (overall ? OVERALL_TONES[overall] : DEFAULT_OVERALL_TONE).panelRing,
        (overall ? OVERALL_TONES[overall] : DEFAULT_OVERALL_TONE).panelBg,
        className,
      )}
      aria-label="Final decision"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-foreground text-sm font-semibold">
          Final decision
        </h3>
        <p className="text-muted-foreground text-xs">
          Pick a final verdict, type your name (audit field — not identity),
          and add optional notes.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Decision</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DECISIONS.map((d) => {
            const checked = decision === d.value;
            const inputId = `final-decision-${d.value}`;
            return (
              <label
                key={d.value}
                htmlFor={inputId}
                data-checked={checked}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-left transition-colors",
                  d.tone,
                )}
              >
                <input
                  id={inputId}
                  type="radio"
                  name="final-decision"
                  value={d.value}
                  checked={checked}
                  onChange={() => setDecision(d.value)}
                  className="mt-0.5"
                />
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <d.Icon className="size-3.5" aria-hidden="true" />
                    {d.label}
                  </div>
                  <p className="text-muted-foreground text-[11px] leading-snug">
                    {d.description}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reviewer-name">
          Your name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="reviewer-name"
          value={reviewerName}
          onChange={(e) => {
            setReviewerName(e.target.value);
            onReviewerNameChange?.(e.target.value);
          }}
          placeholder="Required to save"
          autoComplete="name"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reviewer-notes">Notes</Label>
        <Textarea
          id="reviewer-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={MAX_NOTES_LENGTH}
          placeholder="Anything the next reviewer should know."
          aria-describedby="reviewer-notes-counter"
        />
        <div
          id="reviewer-notes-counter"
          className="text-muted-foreground text-[11px]"
        >
          {notes.length} / {MAX_NOTES_LENGTH}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!canSave}
          onClick={handleSave}
        >
          <Save className="size-3.5" aria-hidden="true" />
          {saving ? "Saving…" : "Save review"}
        </Button>
      </div>
    </div>
  );
}
