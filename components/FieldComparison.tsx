"use client";

import { diffWords, type Change } from "diff";

/**
 * Side-by-side red-line comparison for any verification field row.
 *
 * Two mono columns:
 *   - **Expected** — the application-data value the agent typed in (or the
 *     canonical 27 CFR § 16.21 text for the gov-warning row). Tokens that
 *     are *missing* on the label render with a strikethrough red highlight.
 *   - **Extracted from label** — what the LLM/OCR pulled off the artwork.
 *     Tokens that are *extra* (not in the expected value) render with an
 *     amber highlight.
 *
 * For passing rows the diff has no add/remove segments, so both columns
 * render plain mono text — same comparison shape, same scan pattern, no
 * special-case visual.
 *
 * Single-accent palette (red + amber, no green) so the styling reads as
 * federal-filing markup, never a celebratory diff.
 */

type FieldValue = string | number | boolean | null;

interface FieldComparisonProps {
  expected: FieldValue;
  extracted: FieldValue;
}

const EMPTY_EXPECTED = "(not specified in the application)";
const EMPTY_EXTRACTED = "(not visible on the label)";

export function FieldComparison({
  expected,
  extracted,
}: FieldComparisonProps) {
  const expectedStr = toDisplayString(expected);
  const extractedStr = toDisplayString(extracted);
  // If both sides are blank there's nothing to compare — caller should
  // gate this, but defend anyway so a stray row doesn't crash.
  if (!expectedStr && !extractedStr) return null;

  const changes = diffWords(expectedStr, extractedStr);

  return (
    <div
      className="border-border/60 mt-1 grid grid-cols-1 gap-3 rounded-md border bg-card/40 p-3 text-[11px] lg:grid-cols-2"
      data-testid="field-comparison"
      aria-label="Expected vs extracted comparison"
    >
      <DiffColumn
        heading="Expected"
        subtitle="from the application data tab"
        emptyMessage={EMPTY_EXPECTED}
        rendered={renderExpectedSide(changes)}
        hasContent={expectedStr.length > 0}
      />
      <DiffColumn
        heading="Extracted from label"
        emptyMessage={EMPTY_EXTRACTED}
        rendered={renderExtractedSide(changes)}
        hasContent={extractedStr.length > 0}
      />
    </div>
  );
}

function DiffColumn({
  heading,
  subtitle,
  emptyMessage,
  rendered,
  hasContent,
}: {
  heading: string;
  subtitle?: string;
  emptyMessage: string;
  rendered: React.ReactNode;
  hasContent: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline gap-1.5">
        <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
          {heading}
        </span>
        {subtitle ? (
          <span className="text-muted-foreground/70 text-[10px] italic">
            {subtitle}
          </span>
        ) : null}
      </div>
      <p className="text-foreground/90 whitespace-pre-wrap font-mono leading-relaxed">
        {hasContent ? (
          rendered
        ) : (
          <span className="text-muted-foreground italic">{emptyMessage}</span>
        )}
      </p>
    </div>
  );
}

function toDisplayString(value: FieldValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function renderExpectedSide(changes: Change[]): React.ReactNode[] {
  return changes
    .map((c, i) => {
      if (c.added) return null; // belongs to extracted side only
      if (c.removed) {
        // Token is in expected but missing from extracted — strikethrough.
        return (
          <del
            key={`e-${i}`}
            className="bg-red-500/15 text-red-700 dark:text-red-300 rounded-sm px-0.5 no-underline line-through"
          >
            {c.value}
          </del>
        );
      }
      return <span key={`e-${i}`}>{c.value}</span>;
    })
    .filter((n): n is React.ReactElement => n !== null);
}

function renderExtractedSide(changes: Change[]): React.ReactNode[] {
  return changes
    .map((c, i) => {
      if (c.removed) return null; // belongs to expected side only
      if (c.added) {
        // Token is on the label but not in the expected value.
        return (
          <ins
            key={`x-${i}`}
            className="bg-amber-500/20 text-amber-800 dark:text-amber-200 rounded-sm px-0.5 no-underline"
          >
            {c.value}
          </ins>
        );
      }
      return <span key={`x-${i}`}>{c.value}</span>;
    })
    .filter((n): n is React.ReactElement => n !== null);
}
