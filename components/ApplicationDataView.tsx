"use client";

import type { ApplicationData } from "@/lib/ai/schema";
import { Button } from "@/components/ui/button";

/**
 * Read-only renderer for `ApplicationData`. Shown on the queue flow's
 * Application-Data tab in place of the editable RHF form.
 *
 * Why read-only? `PROJECT_BRIEF.md` frames the agent's job as checking
 * the label against the application — Sarah Chen: "an agent pulls up an
 * application, looks at the label artwork, and checks that what's on
 * the label matches what's in the application." None of the four
 * stakeholder interviews describe agents *editing* the application.
 * Dave Morrison's STONE'S THROW vs Stone's Throw mismatch was resolved
 * by judgment ("obviously the same thing"), not by changing the
 * application; Jenny Park's bad-image case is resolved by rejecting
 * and asking for a better one. The application is the source of truth
 * already on file in COLA — Marcus Williams's "we're not looking to
 * integrate with COLA directly" keeps that data immutable in this POC.
 *
 * The direct `/review` flow (no `?scenario=`) keeps the editable
 * `ExpectedDataForm` because in that mode the agent IS standing in
 * for the applicant for ad-hoc / manual upload reviews.
 */

const BEVERAGE_LABELS: Record<ApplicationData["beverageType"], string> = {
  "distilled-spirits": "Distilled spirits",
  wine: "Wine",
  "malt-beverage": "Malt beverage",
  unknown: "Unknown / other",
};

export interface ApplicationDataViewProps {
  data: ApplicationData;
  onVerify: () => void;
  isVerifying?: boolean;
}

export function ApplicationDataView({
  data,
  onVerify,
  isVerifying = false,
}: ApplicationDataViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        On file with this application — read-only. To correct an entry,
        reject the application or kick it back for a corrected filing.
      </p>

      <dl className="border-border/60 divide-y divide-border/60 rounded-xl border bg-card/40">
        <Row label="Brand name" value={data.brand} />
        <Row label="Class / type designation" value={data.classType} />
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-border/60">
          <Row label="ABV (%)" value={String(data.abv)} />
          <Row label="Net contents" value={data.netContents} />
        </div>
        <Row label="Bottler / producer name" value={data.bottlerName} />
        <Row label="Bottler / producer address" value={data.bottlerAddress} />
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-border/60">
          <Row label="Country of origin" value={data.countryOfOrigin} />
          <Row
            label="Beverage type"
            value={BEVERAGE_LABELS[data.beverageType]}
          />
        </div>
        {data.applicationNotes ? (
          <Row label="Application notes / reference" value={data.applicationNotes} />
        ) : null}
      </dl>

      {data.govWarningRequired ? (
        <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          Government warning required for this beverage
        </div>
      ) : null}

      <div className="flex justify-end pt-1">
        <Button
          type="button"
          onClick={onVerify}
          disabled={isVerifying}
          aria-label={isVerifying ? "Verifying" : "Verify label"}
        >
          {isVerifying ? "Verifying…" : "Verify label"}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <dt className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
        {label}
      </dt>
      <dd className="text-foreground text-sm">{value}</dd>
    </div>
  );
}
