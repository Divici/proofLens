"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldRow } from "./FieldRow";
import { LabelImagePreview } from "./LabelImagePreview";
import type {
  FieldResult,
  FieldStatus,
  OverallStatus,
} from "@/lib/verify/types";
import { cn } from "@/lib/utils";

export interface VerificationDetailProps {
  imageSrc: string | null;
  fieldResults: ReadonlyArray<FieldResult>;
  overall: OverallStatus;
  processingTimeMs: number;
  primaryUsd: number;
  ocrConfidence: number;
  className?: string;
}

const OVERALL_VISUALS: Record<
  OverallStatus,
  { label: string; tone: string; description: string }
> = {
  pass: {
    label: "Pass",
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-600/30",
    description: "Every required field matches the application.",
  },
  "pass-with-warnings": {
    label: "Pass with Warnings",
    tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-600/30",
    description:
      "All required fields are present; some are likely matches and warrant a second look.",
  },
  fail: {
    label: "Fail",
    tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-600/30",
    description:
      "At least one strict check failed. Reject or request a corrected label.",
  },
  "needs-manual-review": {
    label: "Needs Manual Review",
    tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-600/30",
    description:
      "Some fields require human judgement before this label can be cleared.",
  },
  "request-better-image": {
    label: "Request Better Image",
    tone: "bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-orange-600/30",
    description:
      "OCR confidence is low. Ask the applicant for a clearer scan before reviewing.",
  },
};

function statusTone(status: FieldStatus): string {
  // (kept here in case the verdict panel needs per-field counts later)
  return status;
}

export function VerificationDetail({
  imageSrc,
  fieldResults,
  overall,
  processingTimeMs,
  primaryUsd,
  ocrConfidence,
  className,
}: VerificationDetailProps) {
  const [activeField, setActiveField] = useState<string | null>(null);

  const activeBbox = useMemo(() => {
    if (!activeField) return null;
    const f = fieldResults.find((r) => r.field === activeField);
    return f?.bbox ?? null;
  }, [activeField, fieldResults]);

  const handleSelect = (field: string) => {
    setActiveField((current) => (current === field ? null : field));
  };

  const overallVisual = OVERALL_VISUALS[overall];

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <Card className="flex flex-col gap-0 overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Verification result</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
                overallVisual.tone,
              )}
              aria-label={`Overall: ${overallVisual.label}`}
            >
              <span className="text-foreground/60 text-[10px] font-medium uppercase tracking-wide">
                Overall:
              </span>
              <span>{overallVisual.label}</span>
            </span>
          </CardTitle>
          <CardDescription>{overallVisual.description}</CardDescription>
        </CardHeader>

        <CardContent className="grid grid-cols-1 gap-4 px-0 py-0 lg:grid-cols-[1fr_1.2fr]">
          <div className="border-b lg:border-b-0 lg:border-r p-4">
            <LabelImagePreview
              src={imageSrc}
              alt="Label preview with verification highlight"
              bbox={activeBbox}
            />
            <p className="text-muted-foreground mt-2 text-xs">
              Click a field on the right to highlight its source on the label.
            </p>
          </div>

          <div className="flex flex-col">
            <ul
              role="list"
              className="divide-border divide-y border-b border-t lg:border-t-0"
            >
              {fieldResults.map((result) => (
                <li
                  key={result.field}
                  data-status={statusTone(result.status)}
                >
                  <FieldRow
                    result={result}
                    onSelect={handleSelect}
                    selected={activeField === result.field}
                  />
                </li>
              ))}
            </ul>
          </div>
        </CardContent>

        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-xs">
          <span>
            Latency:{" "}
            <span className="text-foreground font-medium">
              {formatLatency(processingTimeMs)}
            </span>
          </span>
          <span>
            AI spend:{" "}
            <span className="text-foreground font-medium">
              {formatCost(primaryUsd)}
            </span>
          </span>
          <span>
            OCR confidence:{" "}
            <span className="text-foreground font-medium">
              {Math.round(ocrConfidence * 100)}%
            </span>
          </span>
        </div>
      </Card>
    </div>
  );
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatCost(usd: number): string {
  if (usd >= 0.01) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}
