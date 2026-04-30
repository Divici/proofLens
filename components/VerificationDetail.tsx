"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CircleCheck,
  Eye,
  HelpCircle,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldRow } from "./FieldRow";
import { LabelImagePreview } from "./LabelImagePreview";
import type { FieldResult, OverallStatus } from "@/lib/verify/types";
import type { BeverageType } from "@/lib/ai/schema";
import {
  FLAG_LABELS,
  type ImageQualityFlag,
} from "@/lib/quality/types";
import { UNKNOWN_BEVERAGE_BANNER } from "@/lib/verify/beverage-rules";
import { cn } from "@/lib/utils";

export interface VerificationDetailProps {
  imageSrc: string | null;
  fieldResults: ReadonlyArray<FieldResult>;
  overall: OverallStatus;
  processingTimeMs: number;
  primaryUsd: number;
  ocrConfidence: number;
  className?: string;
  /**
   * Image-quality flags to surface in a banner above the field rows.
   * Empty / undefined → no banner.
   */
  imageQualityFlags?: ReadonlyArray<ImageQualityFlag>;
  /**
   * Beverage type — when "unknown", an additional banner explains that
   * only universal fields were verified.
   */
  beverageType?: BeverageType;
}

const OVERALL_VISUALS: Record<
  OverallStatus,
  { label: string; tone: string; description: string; Icon: LucideIcon }
> = {
  pass: {
    label: "Pass",
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-600/30",
    description: "Every required field matches the application.",
    Icon: CircleCheck,
  },
  "pass-with-warnings": {
    label: "Pass with Warnings",
    tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-600/30",
    description:
      "All required fields are present; some are likely matches and warrant a second look.",
    Icon: AlertTriangle,
  },
  fail: {
    label: "Fail",
    tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-600/30",
    description:
      "At least one strict check failed. Reject or request a corrected label.",
    Icon: XCircle,
  },
  "needs-manual-review": {
    label: "Needs Manual Review",
    tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-600/30",
    description:
      "Some fields require human judgement before this label can be cleared.",
    Icon: Eye,
  },
  "request-better-image": {
    label: "Request Better Image",
    tone: "bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-orange-600/30",
    description:
      "OCR confidence is low. Ask the applicant for a clearer scan before reviewing.",
    Icon: Camera,
  },
};

export function VerificationDetail({
  imageSrc,
  fieldResults,
  overall,
  processingTimeMs,
  primaryUsd,
  ocrConfidence,
  className,
  imageQualityFlags,
  beverageType,
}: VerificationDetailProps) {
  const [activeField, setActiveField] = useState<string | null>(null);
  const qualityFlags = imageQualityFlags ?? [];
  const showQualityBanner = qualityFlags.length > 0;
  const showUnknownBanner = beverageType === "unknown";

  const activeBbox = useMemo(() => {
    if (!activeField) return null;
    const f = fieldResults.find((r) => r.field === activeField);
    return f?.bbox ?? null;
  }, [activeField, fieldResults]);

  const handleSelect = (field: string) => {
    setActiveField((current) => (current === field ? null : field));
  };

  const overallVisual = OVERALL_VISUALS[overall];
  const OverallIcon = overallVisual.Icon;

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
              <OverallIcon
                aria-hidden="true"
                data-testid="overall-status-icon"
                className="size-3.5"
              />
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
            {showQualityBanner ? (
              <div
                role="alert"
                aria-label="Image quality issues detected"
                className="border-b border-orange-600/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-700 dark:text-orange-300"
              >
                <div className="flex items-start gap-2">
                  <Camera
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <div className="flex flex-col gap-1.5">
                    <p className="font-semibold">
                      Image quality issues detected.
                    </p>
                    <ul className="flex flex-wrap items-center gap-1.5">
                      {qualityFlags.map((flag) => (
                        <li
                          key={flag}
                          className="inline-flex items-center rounded-full bg-orange-600/20 px-2 py-0.5 text-xs font-medium"
                        >
                          {FLAG_LABELS[flag]}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs">
                      Suggested action: Request Better Image — we&apos;ve kept
                      any clearly failing checks but flagged anything else for
                      human review. Please request a clearer photo if you can.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {showUnknownBanner ? (
              <div
                role="status"
                aria-label="Beverage type unknown"
                className="border-b border-violet-600/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-700 dark:text-violet-300"
              >
                <div className="flex items-start gap-2">
                  <HelpCircle
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <p>{UNKNOWN_BEVERAGE_BANNER}</p>
                </div>
              </div>
            ) : null}

            <ul
              role="list"
              className="divide-border divide-y border-b border-t lg:border-t-0"
            >
              {fieldResults.map((result) => (
                <li key={result.field} data-status={result.status}>
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
