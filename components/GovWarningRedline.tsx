"use client";

import { diffWords, type Change } from "diff";
import { GOV_WARNING_CANONICAL } from "@/lib/verify/strict/gov-warning-canonical";

/**
 * Side-by-side red-line view for the regulated 27 CFR § 16.21 government
 * warning. Renders the canonical text on the left with strikethrough
 * highlights on tokens that the label is **missing**, and the extracted
 * text on the right with amber highlights on tokens the label has that
 * the canonical doesn't.
 *
 * Why a dedicated view: the gov-warning is the only field with a strict
 * 100 %-recall regulatory contract. A single missing comma rejects an
 * application — the audit document needs to show *which* comma. A
 * one-line "off by 3 chars" explanation isn't enough for a reviewer
 * defending a rejection later.
 *
 * Mono font + paper-style background mirrors how the actual federal
 * filing looks when an editor red-lines it. Single accent colour
 * (red + amber) — no green, no celebratory styling on a compliance
 * miss.
 */

interface GovWarningRedlineProps {
  /** Verbatim text the matcher consumed (LLM extraction or OCR slice). */
  candidate: string;
}

export function GovWarningRedline({ candidate }: GovWarningRedlineProps) {
  const changes = diffWords(GOV_WARNING_CANONICAL, candidate);

  return (
    <div
      className="border-border/60 mt-2 grid grid-cols-1 gap-3 rounded-md border bg-card/40 p-3 text-[11px] lg:grid-cols-2"
      data-testid="gov-warning-redline"
      aria-label="Government warning red-line comparison"
    >
      <DiffColumn
        label="Canonical 27 CFR § 16.21"
        emptyMessage="(canonical text is empty — should never happen)"
        renderer={renderCanonical}
        changes={changes}
      />
      <DiffColumn
        label="Extracted from label"
        emptyMessage="(label warning could not be extracted)"
        renderer={renderCandidate}
        changes={changes}
      />
    </div>
  );
}

function DiffColumn({
  label,
  emptyMessage,
  renderer,
  changes,
}: {
  label: string;
  emptyMessage: string;
  renderer: (changes: Change[]) => React.ReactNode;
  changes: Change[];
}) {
  const rendered = renderer(changes);
  const hasContent = Array.isArray(rendered) ? rendered.length > 0 : Boolean(rendered);
  return (
    <div>
      <p className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </p>
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

/**
 * Walk the diff and emit nodes only relevant to the canonical column —
 * unchanged tokens render plain, removed tokens (in canonical, missing
 * from label) render with a strikethrough highlight, added tokens are
 * dropped because they don't belong to the canonical view.
 */
function renderCanonical(changes: Change[]): React.ReactNode[] {
  return changes
    .map((c, i) => {
      if (c.added) return null;
      if (c.removed) {
        return (
          <del
            key={`c-${i}`}
            className="bg-red-500/15 text-red-700 dark:text-red-300 rounded-sm px-0.5 no-underline line-through"
          >
            {c.value}
          </del>
        );
      }
      return <span key={`c-${i}`}>{c.value}</span>;
    })
    .filter((n): n is React.ReactElement => n !== null);
}

function renderCandidate(changes: Change[]): React.ReactNode[] {
  return changes
    .map((c, i) => {
      if (c.removed) return null;
      if (c.added) {
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
