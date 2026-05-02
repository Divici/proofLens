# 0008: Queue page + design language adoption

**Date:** 2026-05-02
**Status:** Accepted
**Phase:** Post-Phase-9 polish

## Inputs

- **`PROJECT_BRIEF.md`** — verbatim take-home brief, including the four
  stakeholder interviews (Sarah Chen, Marcus Williams, Dave Morrison,
  Jenny Park). Source of truth for every UX rationale below.
- **`design/active-review-prototype.html`** — design reference for the
  Active Review screen. Visual language (calm white surface, dark
  header bar, pill statuses, two-column artwork + table layout) and
  CSS color tokens we adopt across the app.
- **`public/demo-labels/real/manifest.json`** — real-bottle-photo
  inventory paired with the application data each photo simulates.
  Multiple photos of the same product (front / angled / glare) become
  separate queue rows so the demo exercises image-quality detection on
  realistic signal.

## Context

`PROJECT_BRIEF.md` records the agent workflow Sarah Chen described:

> "An agent pulls up an application, looks at the label artwork, and
> checks that what's on the label matches what's in the application.
> Brand name matches? Check. ABV is correct? Check."

Through Phase 9, `/review` made the agent **type** application data by
hand, or click "Load demo scenario" to fill it. Neither flow reflects
the workflow above — in real life the application data is already on
file in COLA when the agent starts the review.

The brief also implies a queue concept. Sarah:

> "agents drowning in routine stuff"

Janet (relayed by Sarah):

> "during peak season, we get these big importers who dump 200, 300
> label applications on us at once."

Both presume work arrives in a list the agent works through, not as
ad-hoc one-offs.

Two further constraints from the brief shape the design:

- **Marcus Williams (IT):** "we're not looking to integrate with COLA
  directly — that's a whole different beast with its own authorization
  requirements." → the queue is mock; APP-IDs are synthetic.
- **Marcus again:** "don't do anything crazy. We're not storing
  anything sensitive for this exercise." → reviewer progress lives in
  IndexedDB; no server-side persistence; no auth.

## Decision

1. **`/queue` becomes the home (`/` redirects there).** Lists mock
   pending applications mapped 1:1 from the in-repo `DEMO_SCENARIOS`
   plus the manifest-driven `REAL_SCENARIOS`. Each row shows a
   deterministic APP-ID, brand, beverage type, source pill (Synthetic
   vs Real photo), description, and Reviewed-status pill.
2. **`/review` accepts `?scenario=<id>`.** When present, the page
   pre-loads BOTH the image and the application form from that
   scenario. The agent lands on a fully-populated Active Review —
   matching the brief's "data was already on file in COLA" workflow.
3. **Breadcrumb `Application Queue > APP-2026-XXXX`** appears on
   `/review` when the scenario param is set. Direct entry to `/review`
   (manual upload + manual entry) remains supported and shows no
   breadcrumb. This honors Dave Morrison's "if something can help me
   get through my queue faster, great. Just don't make my life harder
   in the process" — the manual path stays available.
4. **Site nav: Queue · Batch · History · Settings.** Active Review is
   contextual and reached via the queue; it does not get its own nav
   entry. `/batch` stays for Janet's "200, 300 at once" use case.
5. **Status-pill vocabulary aligns with the brief's reviewer
   language.** Field-level "Match / Flagged / Missing / Manual Review"
   instead of the engineering "Pass / Warning / Fail" — Sarah's "my
   mother could figure out" benchmark explicitly calls for clean,
   obvious labels. Overall pill keeps "Pass / Pass with Warnings /
   Needs Manual Review / Fail / Request Better Image" per PRD R-008.
6. **Camera capture removed.** `PROJECT_BRIEF.md` does not mention
   live photo capture — Jenny Park's image-quality discussion
   describes brewery-submitted artwork the agent reads, not the agent
   taking new photos themselves:

   > "I've seen labels that are photographed at weird angles, or the
   > lighting is bad, or there's glare on the bottle."

   Camera was an internal Phase-0 addition that predates
   `PROJECT_BRIEF.md` becoming the source of truth. Marcus's "our
   network blocks outbound traffic to a lot of domains" further
   argues against features that depend on browser device APIs in the
   deployed posture. ADR 0004 is marked superseded by this ADR; the
   `CameraCapture` component, `lib/camera/` module, dedicated
   Playwright project, and `?source=camera` URL param are all removed.
7. **Visual language adopted from `design/active-review-prototype.html`.**
   Solid pastel pills, dark CTA, calm white surface, breadcrumb +
   header structure, table-row hover tint. We adopt the *language*
   without porting the literal HTML — our existing `FieldRow`
   component renders the field + explanation + evidence vertically
   (richer than the prototype's single table row) and stays.
8. **`scenarioId` added to the `Review` IndexedDB schema as an optional
   string.** Lets the queue's "Reviewed" status pill be exact instead
   of brand-fuzzy. Additive change; existing records stay valid; no
   `CURRENT_RULES_VERSION` bump.
9. **Real-photo scenarios live alongside synthetic ones.** Multiple
   photos of the same product (front / angled / glare / low light)
   show up as separate queue rows so the reviewer sees how proofLens
   handles each condition. This directly addresses Jenny's wish that
   "AI could handle some of that" image-quality variation.

## APP-ID format

- Synthetic scenarios: `APP-2026-NNNN` (zero-padded sequential).
- Real-photo scenarios: `APP-2026-RNNN` (zero-padded sequential, R prefix).

The `R` prefix telegraphs "real photo" at a glance and keeps the two
sets in clearly disjoint id spaces. The 2026 year segment matches
`CURRENT_RULES_VERSION = "ttb-2026-04-30"`.

## Consequences

### Wins

- The reviewer lands directly in their work — no friction figuring out
  where to start. Sarah's "my mother could figure out" benchmark.
- The Active Review is pre-loaded, mirroring how the actual TTB
  workflow operates (data already in COLA).
- Status vocabulary maps to the agent's mental model from the brief's
  interviews.
- Real bottle photos stress the image-quality heuristics with realistic
  signal — glare and angles flag as `imageQualityFlags` and demote
  affected fields to `manual-review`. Demonstrates the pipeline on the
  exact failure mode Jenny called out.
- Removing camera capture simplifies the queue model (agents review
  submitted artifacts, they don't snap photos) and drops a feature
  Marcus's restricted-network environment would block anyway.

### Trade-offs

- Mock APP-IDs (`APP-2026-NNNN` / `APP-2026-RNNN`) are not real COLA
  references. The brief explicitly scopes COLA integration out
  (Marcus interview).
- The queue is a static view of `DEMO_SCENARIOS` + `REAL_SCENARIOS`.
  To add a "real" pending application a developer edits the array or
  drops a photo into the manifest; there is no upload UI on the Queue
  page itself. Bulk uploads still live at `/batch`.
- The "Reviewed" status pill is exact (matched by `scenarioId` on the
  saved Review record). Reviews saved without a `scenarioId` —
  defensive fallback only; none exist today — count as Pending for
  the queue.
- Direct `/review` entry remains supported, so we keep both manual
  uploader and queue-driven entry alive. That's two code paths through
  one page; the page handles both with a `fromQueue` boolean derived
  from the URL.

## Implementation

- `app/queue/page.tsx` — new route. Reads `listApplications()` for
  rows; reads IndexedDB via `listReviews()` to mark Reviewed/Pending.
- `lib/queue/applications.ts` — pure mapper from `DemoScenario` and
  `RealScenario` to `QueuedApplication` (deterministic APP-IDs).
- `lib/demo/real-scenarios.ts` — Zod-validated manifest loader for
  real bottle photos.
- `lib/storage/types.ts` — `Review` adds optional `scenarioId?: string`.
- `lib/storage/compose-review.ts` — `composeReview()` accepts and
  persists `scenarioId` when supplied.
- `app/review/page.tsx` — reads `?scenario=<id>`, pre-loads image +
  form, renders breadcrumb, persists `scenarioId` on save.
- `components/site-nav.tsx` — new nav entries (Queue · Batch · History
  · Settings); wordmark links to `/queue`.
- `app/page.tsx` — `redirect('/queue')`.
- E2E: `test/e2e/queue.spec.ts` covers the queue → review handoff
  (synthetic and real-photo paths).

## Supersedes

- ADR 0004 (Camera capture + permissions state machine) — superseded
  by removal in this redesign.
