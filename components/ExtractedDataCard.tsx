"use client";

import {
  EXTRACTED_FIELD_LABELS,
  type ExtractedField,
  type ExtractedLabelData,
} from "@/lib/ai/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ExtractedDataCardProps {
  extracted: ExtractedLabelData;
  processingTimeMs: number;
  primaryUsd: number;
  className?: string;
}

/**
 * Renders the structured `ExtractedLabelData` as a stack of field rows
 * with per-field confidence + evidence quote, plus telemetry
 * (latency + AI spend). Slice 0002 stops at raw rendering — no
 * pass/fail badges or status enum (those land in slice 0003).
 */
export function ExtractedDataCard({
  extracted,
  processingTimeMs,
  primaryUsd,
  className,
}: ExtractedDataCardProps) {
  return (
    <Card className={cn("flex w-full flex-col gap-0", className)}>
      <CardHeader className="border-b">
        <CardTitle>Extracted label data</CardTitle>
        <CardDescription>
          Raw fields read from the label by the vision LLM. Verification
          arrives in the next slice.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col divide-y divide-border/60 py-0">
        {EXTRACTED_FIELD_LABELS.map(({ key, label }) => {
          const field = extracted[key];
          return (
            <FieldRow key={key} label={label} field={field} />
          );
        })}
      </CardContent>

      <div className="flex flex-col gap-3 border-t bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        {extracted.imageQualityNotes.length > 0 ? (
          <div>
            <p className="text-foreground/80 mb-1 text-xs font-medium">
              Image-quality notes
            </p>
            <ul className="list-disc pl-4 text-xs">
              {extracted.imageQualityNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>
            Overall confidence:{" "}
            <span className="text-foreground font-medium">
              {formatConfidence(extracted.extractionConfidence)}
            </span>
          </span>
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
        </div>
      </div>
    </Card>
  );
}

interface FieldRowProps {
  label: string;
  field: ExtractedField;
}

function FieldRow({ label, field }: FieldRowProps) {
  const display = renderValue(field.value);
  const isMissing = field.value === null;
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 px-4 py-3",
        isMissing && "text-muted-foreground",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-foreground/80 text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
        <span className="text-xs">{formatConfidence(field.confidence)}</span>
      </div>
      <div className="text-foreground text-sm">
        {isMissing ? (
          <span className="text-muted-foreground italic">Not visible</span>
        ) : (
          display
        )}
      </div>
      {field.evidenceQuote ? (
        <div className="text-muted-foreground border-l-2 border-border pl-2 text-xs italic">
          “{field.evidenceQuote}”
        </div>
      ) : null}
    </div>
  );
}

function renderValue(value: ExtractedField["value"]): React.ReactNode {
  if (value === null) return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatCost(usd: number): string {
  if (usd >= 0.01) return `$${usd.toFixed(2)}`;
  // Sub-cent cost — show 4 decimal places for transparency.
  return `$${usd.toFixed(4)}`;
}
