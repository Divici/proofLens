# Plan — Option A: Queue + Active Review + design language

> Self-contained execution plan. A fresh agent session can pick this up
> cold by reading: this file, `PROJECT_BRIEF.md`,
> `design/active-review-prototype.html`, `PRD.md`, and the existing
> files referenced under "Touch list" below.
>
> **Do not reference any prior-art repos or external reviewer tools in
> any tracked artifact.** Cite the project brief stakeholder interviews
> as the source of every UX decision. The brief lives at
> `PROJECT_BRIEF.md` — every step below points back to a specific
> stakeholder quote. The visual target lives at
> `design/active-review-prototype.html` — open in a browser to see the
> rendered intent.

---

## 1. Why this work exists

`PROJECT_BRIEF.md` records the actual stakeholder workflow:

> Sarah Chen (Deputy Director): *"An agent pulls up an application,
> looks at the label artwork, and checks that what's on the label
> matches what's in the application. Brand name matches? Check. ABV is
> correct? Check. Government warning is there? Check."*

Today's `/review` page makes the agent **type** the application data by
hand (or click "Load demo scenario" to fill it). That doesn't reflect
the workflow Sarah described — in real life the application data is
already on file in COLA when the agent starts the review. The prototype
should simulate that pre-loaded state.

The brief also calls out that agents work from a queue of pending
applications — Sarah's "agents drowning in routine stuff" and Janet's
"big importers dump 200, 300 at once" both imply a queue concept.
Today we expose `/batch` for the bulk path and `/review` for ad-hoc;
neither shows the agent the *list of work in front of them*.

Option A introduces a `/queue` page that lists mock pending
applications. Click a row → `/review` opens with the image AND
application form pre-loaded from that scenario. This honors the brief
without inventing a COLA integration.

The same change carries the design-language vocabulary update Sarah's
"my mother could figure out" benchmark calls for: status pills speak
the agent's language ("Match" / "Flagged" / "Missing"), nav structure
mirrors the workflow (Queue → Active Review → History).

---

## 2. Scope

### In scope

- **Remove the live camera-capture feature.** `PROJECT_BRIEF.md` is
  silent on camera capture — Jenny's image-quality discussion is
  about brewery-submitted artwork the agent reads, not about the
  agent taking new photos themselves. Camera was an internal Phase-0
  addition that predates the brief becoming the source of truth.
  Removing it simplifies the queue model (agents review submitted
  artifacts, they don't snap photos) and drops a feature that
  Marcus's restricted-network environment would block anyway.
- New route `/queue` — list of pending applications, click → review.
- New route `/queue` becomes the **home** (`/` redirects to `/queue`).
- `/review` accepts a `?scenario=<id>` query param and pre-loads both
  the image and the application form when present.
- Breadcrumb on `/review`: `Application Queue > APP-2026-XXXX` (or
  `APP-2026-RNNN` for real-photo scenarios) when arriving from a
  queue row; absent for direct manual entry.
- Site nav reordered to: **Queue · Batch · History · Settings**.
  No "Active Review" nav entry — it's contextual; the breadcrumb
  signals it.
- Project brief saved as a tracked file (`PROJECT_BRIEF.md`).
- New ADR `decisions/0008-queue-and-design-language.md`.
- **Real bottle photos under `public/demo-labels/real/`** with a
  `manifest.json` that pairs each photo with its application data.
  Multiple photos of the same bottle (front / angled / glare / low
  light) are valid — they become separate queue rows so the demo
  shows how proofLens handles each condition.
- Design language continued from `e4f42d6`:
  - Pill palette already updated; verify rows render correctly on
    new layouts.
  - Add light spacing/padding tweaks to `/review` Active Review pane
    so it reads more like a "filing being marked up" than a SaaS
    dashboard.

### Out of scope (explicitly)

- **Live camera capture stays removed.** Brief is silent; we drop
  the feature in this same redesign (see in-scope above).
- COLA integration of any kind (per brief: *"we're not looking to
  integrate with COLA directly"* — Marcus).
- Auth / login / per-agent identity (per brief: *"don't do anything
  crazy. We're not storing anything sensitive for this exercise"* —
  Marcus). The reviewer name continues to be a free-text input on
  the final-decision panel.
- Server-side queue persistence. The "queue" is a static view of the
  in-repo `DEMO_SCENARIOS` array. Status (pending vs reviewed) reads
  from IndexedDB so a reviewer's progress survives reload.
- Replacing the existing `FieldRow` vertical layout with a literal
  HTML-table-cell layout. The pill palette + breadcrumb + nav covers
  ~80% of the design intent; a full table-cell rewrite would touch
  too many tested components and is a separate phase.
- Removing the `/batch` route. It still serves Janet's "200-300 at
  once" use case and stays in the nav.

---

## 3. Files to create / modify

### New files

| Path | Purpose |
|---|---|
| `PROJECT_BRIEF.md` | The original take-home brief, verbatim. Tracked. Source of truth for every UX decision below. |
| `decisions/0008-queue-and-design-language.md` | ADR documenting the queue redesign + design vocabulary adoption. Cite stakeholder interviews from `PROJECT_BRIEF.md`. |
| `app/queue/page.tsx` | The Queue page. Client component (reads IndexedDB for done-status). Lists `DEMO_SCENARIOS`. |
| `app/queue/page.test.tsx` (optional) | Unit test for queue rendering + click-through. |
| `lib/queue/applications.ts` | Pure helper: maps a `DemoScenario` to a `QueuedApplication` with deterministic mock APP-ID (e.g. `APP-2026-0001`). |
| `lib/queue/applications.test.ts` | Unit test for the mapper (id format, ordering, all 14 scenarios mapped). |
| `test/e2e/queue.spec.ts` | E2E: visit `/queue`, click a row, verify `/review` opens with pre-loaded image + form values. |

### Modified files

| Path | Change |
|---|---|
| `app/page.tsx` | Replace landing splash with `redirect('/queue')`. Keep file thin. |
| `app/review/page.tsx` | Read `?scenario=<id>` from `useSearchParams`. On mount, when present: fetch the scenario, pre-fill the image (`setImageFile`) and the form (`setLoadedDemoData` + `setFormKey++`). Render breadcrumb when scenario param is present. Hide the demo-scenario picker dropdown when scenario came from URL (keep "Camera" + manual upload accessible). |
| `components/site-nav.tsx` | Reorder nav: `Queue` (`/queue`) · `Batch` (`/batch`) · `History` (`/history`) · `Settings` (`/settings`). Drop the legacy `New review` link (the queue handles that path). |
| `components/site-nav.test.tsx` | Update assertions for the new link set. |
| `test/e2e/smoke.spec.ts` | Update home-page assertion: home now redirects to `/queue`; assert the queue page renders. |
| `test/e2e/keyboard-only.spec.ts` | Update if it relies on the home → review path. |
| `test/e2e/single-label.spec.ts` and any other spec navigating from home | Adjust to either start at `/review` directly or come through `/queue`. |
| `memory-bank/active-context.md` | Note the post-Phase-9 redesign. |
| `memory-bank/progress.md` | Add a milestone entry. |
| `README.md` | Update the "How to use" section: agent lands on `/queue`, picks an application, reviews. |

---

## 4. Implementation order (dependencies first)

### Step 1 — Static artifacts (no code dependencies)

1. **(already done — verify present)** `design/active-review-prototype.html`
   contains the design reference HTML the user provided (raw markup
   minus the third-party `vid="N"` diagnostic attribs). Open it in a
   browser to confirm the rendered intent. Do not edit; supersede with
   a new file if the design evolves.
2. Write `PROJECT_BRIEF.md` (verbatim from the user's pasted brief).
3. **Real bottle photos.** The user is supplying a set of real bottle
   photos including image-quality variants (different angles,
   lighting, glare). They go under `public/demo-labels/real/` with
   descriptive filenames (e.g. `valley-oak-cab-front.jpg`,
   `valley-oak-cab-glare.jpg`). Alongside them, a single manifest
   file at `public/demo-labels/real/manifest.json` maps each filename
   to its application data:

   ```json
   [
     {
       "filename": "valley-oak-cab-front.jpg",
       "description": "Front-on, clean lighting",
       "applicationData": {
         "brand": "Valley Oak",
         "classType": "Cabernet Sauvignon",
         "abv": 14.5,
         "netContents": "750 mL",
         "bottlerName": "Valley Oak Vineyards",
         "bottlerAddress": "1234 Vineyard Road, Napa, CA 94558",
         "countryOfOrigin": "United States",
         "beverageType": "wine",
         "govWarningRequired": true,
         "applicationNotes": ""
       }
     },
     ...
   ]
   ```

   Multiple photos of the same bottle (front / angled / glare / low
   light) all reference the same `applicationData` — that's the point:
   the queue shows each variant as its own row so the reviewer can
   see how proofLens responds to each condition. Naming convention
   suggestion: shared bottle slug + variant suffix
   (`brand-product-FRONT.jpg`, `brand-product-ANGLED.jpg`).
4. Write `PROJECT_BRIEF.md` (verbatim from the user's pasted brief).
5. Write `decisions/0008-queue-and-design-language.md` (template
   below in §6). The ADR cites `PROJECT_BRIEF.md` (the brief),
   `design/active-review-prototype.html` (the visual target), AND
   `public/demo-labels/real/manifest.json` (real-bottle-photo
   inventory) as inputs.

### Step 2 — Pure helpers + tests

6. **New module `lib/demo/real-scenarios.ts`.** Reads
   `public/demo-labels/real/manifest.json` at build/runtime and emits
   `DemoScenario`-shaped records (same shape as existing
   `DEMO_SCENARIOS` in `lib/demo/scenarios.ts`):

   ```ts
   export interface RealScenario {
     id: string;            // e.g. "real-valley-oak-cab-front"
     name: string;          // e.g. "Valley Oak Cab — Front clean"
     labelPath: string;     // "/demo-labels/real/valley-oak-cab-front.jpg"
     data: ApplicationData;
   }
   export const REAL_SCENARIOS: RealScenario[];
   ```

   Decisions:
   - The id is `real-<filename-without-ext>` so it's stable and
     scenario-load-by-id works for both real and synthetic.
   - The name is derived from the manifest's `description` (or a
     fallback computed from filename).
   - For Next.js: read the manifest via `import manifest from
     './manifest.json'` (relative path from a generator script that
     emits a TS module), OR via a `fs.readFileSync` at module init
     when on the server. Pick whichever keeps the queue page able to
     statically render.
7. Create `lib/queue/applications.ts` with:
   ```ts
   export type ScenarioSource = "synthetic" | "real";

   export interface QueuedApplication {
     applicationId: string;          // synthetic: "APP-2026-0001"
                                     // real:      "APP-2026-R001"
     scenarioId: string;             // matches DEMO_SCENARIOS or REAL_SCENARIOS id
     source: ScenarioSource;
     brand: string;
     beverageType: string;           // human-readable, e.g. "Distilled Spirits"
     description: string;            // pulled from scenario.name or manifest.description
   }
   /**
    * Returns synthetic scenarios first (APP-2026-0001..NNNN) followed
    * by real-photo scenarios (APP-2026-R001..RNNN). Stable order so
    * the queue's row positions don't shuffle between page loads.
    */
   export function listApplications(): QueuedApplication[];
   ```
8. Add `lib/queue/applications.test.ts`:
   - count = synthetic count + real count
   - synthetic IDs match `^APP-\d{4}-\d{4}$` and are sequentially
     padded
   - real IDs match `^APP-\d{4}-R\d{3}$` and are sequentially padded
   - source field is correctly labelled per row
   - deterministic ordering: synthetic block first, then real block
   - every `DEMO_SCENARIOS` and every `REAL_SCENARIOS` entry mapped
     exactly once
   - brand non-empty for every row
9. **Confirmed sign-off (2026-05-02):** add `scenarioId: string` to
   the `Review` schema (`lib/storage/types.ts` `ReviewSchema`) so the
   queue's "Reviewed" status pill is exact, not brand-heuristic.
   - Bump `CURRENT_RULES_VERSION` if the schema change should
     invalidate existing reviews — but `scenarioId` is *additive* and
     optional, so existing reviews stay valid; no version bump.
   - Update `composeReview()` to accept and persist the optional
     `scenarioId`.
   - Update `app/review/page.tsx` `handleSaveDecision` to pass the
     scenarioId from the URL when saving.
   - Update `lib/storage/review-repo.ts` if needed for the new field.
   - Update `composeReview` tests for the new field.

### Step 2.5 — Remove camera capture (scope cut, brief alignment)

The brief (`PROJECT_BRIEF.md`) doesn't mention camera capture; it was
an internal Phase-0 addition. Drop it before the queue work so we
don't have to plumb camera entry points through the new nav.

10a. Delete files:
   - `components/CameraCapture.tsx`
   - `components/CameraCapture.test.tsx`
   - `components/CameraPermissionsPrompt.tsx`
   - `components/CameraPermissionsPrompt.test.tsx`
   - `lib/camera/getusermedia.ts` + any tests
   - `lib/camera/preprocess-worker.ts` + any tests
   - `lib/camera/` entire directory if empty after the above
   - `test/e2e/camera-capture.spec.ts`
10b. Trim `playwright.config.ts`:
   - Remove the `camera` project entry (the dedicated project that
     scopes `--use-fake-ui-for-media-stream` flags). Only the
     `chromium` project remains.
10c. Trim `app/review/page.tsx`:
   - Remove the `cameraOpen` state and its setter.
   - Remove the `<CameraCapture>` render block.
   - Remove the "Camera" button in the demo-controls toolbar.
   - Remove the `?source=camera` URL param handling (if any) — the
     queue is the only entry-point-with-state we need.
   - Remove the `Camera` icon import from `lucide-react` if it's
     unused after the above.
10d. Trim `app/page.tsx`:
   - The home is being replaced with `redirect('/queue')` in Step 13
     anyway, so the "Capture from camera" CTA dies naturally. No
     extra work; just confirm the new home doesn't reintroduce a
     camera link.
10e. Mark ADR 0004 superseded:
   - Open `decisions/0004-camera-capture-and-state-machine.md`.
   - Add a header note at the top:
     ```
     **Status:** Superseded by ADR 0008 (2026-05-02).
     Camera capture removed in the queue redesign — `PROJECT_BRIEF.md`
     does not mention live photo capture, and the queue model assumes
     agents review brewery-submitted artwork rather than taking new
     photos themselves.
     ```
   - Do NOT delete the ADR — ADRs are historical record.
10f. Update `README.md` and any docs (`docs/architecture.md`,
   `docs/troubleshooting.md`) — remove every reference to camera
   capture or `getUserMedia`.
10g. Quality gate after the rip-out:
   - `pnpm typecheck` — clean (catches dangling imports).
   - `pnpm lint` — clean (catches unused imports).
   - `pnpm vitest run` — must stay green; some tests will be deleted
     wholesale, none should fail.
   - `pnpm test:e2e` — should pass with one fewer spec.

### Step 3 — Queue page

11. Create `app/queue/page.tsx`. Use a table-style layout matching the
    pill aesthetic from the design language work in `e4f42d6` and the
    reference in `design/active-review-prototype.html`:
   - Columns: APP-ID (mono) · Brand · Beverage type · Source pill
     ("Synthetic" / "Real photo") · Description · Reviewed status
     pill · Action ("Open review" link).
   - Reads IndexedDB to determine which scenarios already have a saved
     review (status pill = "Reviewed" vs "Pending"). Match by
     `scenarioId` exactly (added in step 6). Reviews saved before the
     schema bump (none yet, but defensively) without a scenarioId
     count as "Pending" for the queue.
   - Sticky header row, hover row tint, clickable row → navigates to
     `/review?scenario=<scenarioId>`.
   - Empty state copy: "No pending applications. Drop a batch CSV
     in /batch to add reviews to your queue."
   - Optional filter chips at the top: "All · Synthetic · Real
     photos · Reviewed · Pending". Defer if it complicates the row.

### Step 4 — Wire `/review` to accept `?scenario=`

12. In `app/review/page.tsx`:
   - Read `scenario` from `useSearchParams()`.
   - In an effect that depends on `[scenario]`: if present and valid,
     resolve the scenario from EITHER `DEMO_SCENARIOS` OR
     `REAL_SCENARIOS` (id prefix `real-` is the disambiguator), fetch
     the image, set loaded demo data, and bump `formKey` once. Reuse
     the existing `handleLoadDemoScenario` body, just trigger it from
     URL state and broaden the lookup.
   - If invalid scenario id, fall back to manual entry and toast a
     warning.
   - Render breadcrumb at the top: `Application Queue > APP-2026-XXXX`
     when scenario param is set; otherwise no breadcrumb.
   - Hide the demo-scenario picker `<select>` and "Load demo scenario"
     button when scenario came from URL (the URL IS the source of
     truth in that flow). Keep them visible for the no-scenario
     manual-entry path.
   - **Confirmed sign-off (2026-05-02):** keep direct `/review` entry
     supported. When no `?scenario=` is present, the page renders
     today's manual-entry experience (uploader + form + demo picker).

### Step 5 — Nav update

13. Update `components/site-nav.tsx`:
   - New `NAV_LINKS = [{ href: '/queue', label: 'Queue' },
     { href: '/batch', label: 'Batch' },
     { href: '/history', label: 'History' },
     { href: '/settings', label: 'Settings' }]`.
   - Remove the old `New review` entry.
   - Active state via `usePathname()`; `/review` highlights `Queue`
     (the parent flow) since there's no Active Review link.
   - Update the existing `site-nav.test.tsx` to assert the new link
     set.

### Step 6 — Home redirect

14. Replace `app/page.tsx` body with:
    ```tsx
    import { redirect } from 'next/navigation';
    export default function Home() {
      redirect('/queue');
    }
    ```

### Step 7 — E2E sweep

15. Add `test/e2e/queue.spec.ts`:
    - Visit `/queue` → assert table renders with ≥6 synthetic rows
      AND ≥1 real-photo row (count depends on the supplied manifest).
    - Click a synthetic row → assert URL becomes
      `/review?scenario=...` and breadcrumb shows
      `APP-2026-NNNN`.
    - Click a real-photo row → assert URL becomes
      `/review?scenario=real-...` and breadcrumb shows
      `APP-2026-RNNN`.
    - For each: assert `<img>` preview is visible AND brand input has
      the scenario's brand value.

16. Audit existing e2e specs that navigate via the home page or click
    `/review` directly. For each, either:
    - Start the test at `/queue` and click through, OR
    - `page.goto('/review')` directly to bypass the queue.
    Both are valid; pick whichever keeps the test specific to its
    intent.

### Step 8 — Docs + memory bank

17. Update `memory-bank/active-context.md`:
    - "Current phase: Phase 9 deploy + Post-deploy queue redesign
      complete. Live at https://prooflens-ai.vercel.app/queue."
18. Update `memory-bank/progress.md`:
    - "Post-deploy: introduced /queue as new home (commit pending);
      reviewer now lands in pending-applications list per
      `PROJECT_BRIEF.md` Sarah Chen interview workflow. Camera
      capture removed (brief silent on it; Step 10 above)."
19. Update `README.md`:
    - "How to use" section: "Open the deployed URL → land in the
      Queue → click an application to review. Manual upload is still
      available at /review for ad-hoc reviews."
    - Note that the queue mixes synthetic placeholder labels with
      real bottle photos (including image-quality variants).
    - Remove every camera-capture mention.

### Step 9 — Quality gates + commit

20. `pnpm typecheck && pnpm lint && pnpm vitest run` — all green.
21. `pnpm test:e2e` — should pass; expect ~21 specs after removing
    `camera-capture.spec.ts` and adding `queue.spec.ts`.
22. Single commit:
    ```
    feat(queue): introduce /queue as home, /review accepts ?scenario=, design-language nav

    Reflects the workflow from PROJECT_BRIEF.md (Sarah Chen, Deputy Director):
    "an agent pulls up an application, looks at the label artwork, and checks
    that what's on the label matches what's in the application." Today's
    /review required the agent to type the application data by hand; the
    Queue page lists pending applications (mapped from DEMO_SCENARIOS), and
    clicking one opens /review with both the image AND the application form
    pre-populated.

    - new /queue route as the home (/ redirects to /queue)
    - /review accepts ?scenario=<id> and pre-loads image + form
    - breadcrumb "Application Queue > APP-2026-XXXX" on Active Review
    - nav reordered: Queue · Batch · History · Settings
    - PROJECT_BRIEF.md added (the take-home brief, verbatim, source of truth
      for UX decisions going forward)
    - design/active-review-prototype.html added (the visual target)
    - public/demo-labels/real/ added with manifest.json — real bottle
      photos including image-quality variants (different angles,
      lighting, glare); each photo becomes its own queue row
    - camera capture removed (brief is silent; ADR 0004 marked superseded)
    - ADR 0008 records the design + nav decisions and the stakeholder
      quotes they trace to
    - scenarioId added to Review schema so the queue's Reviewed pill
      is exact (not a brand heuristic)

    Quality gates green: typecheck/lint/vitest/e2e all green.
    ```
23. `git push origin main` — Vercel auto-deploys.

---

## 5. PROJECT_BRIEF.md content

Paste verbatim from the brief the user provided. Keep all four
interview blocks (Sarah, Marcus, Dave, Jenny). Keep the technical
requirements, sample label, deliverables, and evaluation criteria.
Do not summarise or rewrite — this file is the source of truth for
every UX rationale.

Add a single line at the top:

> This file records the original take-home project brief verbatim.
> It is the source of truth for every UX and product decision in
> proofLens. Cite specific stakeholder quotes when documenting
> design rationale.

No other annotations.

---

## 6. decisions/0008-queue-and-design-language.md template

```markdown
# ADR 0008 — Queue page + design language adoption

**Date:** 2026-05-02
**Status:** Accepted
**Phase:** Post-Phase-9 polish

## Inputs

- **`PROJECT_BRIEF.md`** — verbatim take-home brief, including
  stakeholder interviews. Source of truth for every UX rationale below.
- **`design/active-review-prototype.html`** — design reference for the
  Active Review screen. Visual language (calm white surface, dark
  header bar, pill statuses, two-column artwork + table layout) and
  CSS color tokens we adopt across the app.

## Context

`PROJECT_BRIEF.md` records the agent workflow Sarah Chen described:

> "An agent pulls up an application, looks at the label artwork, and
> checks that what's on the label matches what's in the application.
> Brand name matches? Check. ABV is correct? Check."

Through Phase 9 the `/review` page made the agent type application
data by hand, or click "Load demo scenario" to fill it. Neither
flow reflects the workflow above — in real life the application
data is already on file in COLA when the agent starts the review.

The brief also implies a queue concept: Sarah's "agents drowning
in routine stuff" and Janet's "200-300 labels at once" both assume
work arrives in a list the agent works through.

## Decision

1. New `/queue` page becomes the home (`/` redirects there). Lists
   mock pending applications mapped 1:1 from the in-repo
   `DEMO_SCENARIOS`. Each row shows a deterministic APP-ID, brand,
   beverage type, and reviewed-status pill (read from IndexedDB).
2. `/review` accepts `?scenario=<id>`. When present, the page
   pre-loads BOTH the image and the application form from that
   scenario. The agent lands on a fully-populated Active Review.
3. Breadcrumb `Application Queue > APP-2026-XXXX` appears on
   `/review` when the scenario param is set. Direct entry to
   `/review` (manual upload + manual entry) remains supported and
   shows no breadcrumb.
4. Site nav: **Queue · Batch · History · Settings**. The
   "Active Review" page is contextual and reached via the queue;
   it does not get its own nav entry.
5. Status-pill vocabulary aligns with the brief's reviewer
   language: field-level "Match / Flagged / Missing / Manual
   Review" instead of the engineering "Pass / Warning / Fail".
   Overall pill keeps "Pass / Pass with Warnings / Needs Manual
   Review / Fail / Request Better Image" per PRD R-008.
6. Visual language adopted from `design/active-review-prototype.html`:
   solid pastel pills, dark CTA, calm white surface, breadcrumb +
   header structure, table-row hover tint. We adopt the *language*
   without porting the literal HTML — our existing `FieldRow`
   component renders the field + explanation + evidence vertically
   (richer than the prototype's single table row) and stays.
7. `scenarioId` added to the `Review` IndexedDB schema as an optional
   string. Lets the queue's "Reviewed" status pill be exact instead
   of brand-fuzzy. Additive change; existing records stay valid.

## Consequences

### Wins

- Reviewer lands directly in their work — no friction figuring out
  where to start.
- The Active Review is pre-loaded, mirroring how the actual TTB
  workflow operates (data was already in COLA).
- Status vocabulary maps to the agent's mental model from the
  brief's interviews.

### Trade-offs

- Mock APP-IDs (format `APP-2026-NNNN`) are not real COLA references.
  The brief explicitly scopes COLA integration out (Marcus interview).
- The queue is a static view of `DEMO_SCENARIOS`. To add a "real"
  pending application a developer edits the array; there is no
  upload UI on the Queue page itself. Bulk uploads still live at
  `/batch`.
- The "Reviewed" status pill on the queue is exact (matched by
  `scenarioId` on the saved Review record). Reviews saved without a
  scenarioId — defensive fallback only; none exist today — count as
  Pending for the queue.

## Implementation

- `app/queue/page.tsx` — new route.
- `lib/queue/applications.ts` — pure mapper from `DemoScenario` to
  `QueuedApplication` (deterministic APP-IDs).
- `lib/storage/types.ts` — `ReviewSchema` adds optional
  `scenarioId: z.string().optional()`.
- `lib/storage/compose-review.ts` — `composeReview()` accepts and
  persists `scenarioId` when supplied.
- `app/review/page.tsx` — reads `?scenario=<id>`, pre-loads, persists
  the scenarioId on save.
- `components/site-nav.tsx` — new nav entries.
- `app/page.tsx` — redirects to `/queue`.
- E2E: `test/e2e/queue.spec.ts` covers the queue → review handoff.
```

---

## 7. Touch list (cheat sheet)

```
NEW:
  design/active-review-prototype.html   (already created; verify present)
  PROJECT_BRIEF.md
  decisions/0008-queue-and-design-language.md
  public/demo-labels/real/<photos>.jpg  (user-supplied real bottle photos)
  public/demo-labels/real/manifest.json (filename → application data map)
  lib/demo/real-scenarios.ts            (load manifest into DemoScenario shape)
  lib/demo/real-scenarios.test.ts       (manifest parses, every photo paired)
  app/queue/page.tsx
  lib/queue/applications.ts
  lib/queue/applications.test.ts
  test/e2e/queue.spec.ts

MODIFIED:
  app/page.tsx                          (redirect to /queue)
  app/review/page.tsx                   (?scenario= handling + breadcrumb + persist scenarioId on save; resolves both DEMO_SCENARIOS and REAL_SCENARIOS; remove camera button + state)
  components/site-nav.tsx               (Queue · Batch · History · Settings)
  components/site-nav.test.tsx          (assert new links)
  lib/storage/types.ts                  (add optional scenarioId to ReviewSchema)
  lib/storage/compose-review.ts         (accept + persist scenarioId)
  lib/storage/compose-review.test.ts    (cover scenarioId round-trip)
  playwright.config.ts                  (drop the `camera` project)
  decisions/0004-camera-capture-and-state-machine.md   (mark superseded by ADR 0008)
  test/e2e/smoke.spec.ts                (home → /queue redirect)
  test/e2e/keyboard-only.spec.ts        (rework if needed)
  test/e2e/single-label.spec.ts         (rework if needed)
  test/e2e/override-and-history.spec.ts (rework if needed)
  test/e2e/verification.spec.ts         (rework if needed)
  test/e2e/export.spec.ts               (rework if needed)
  memory-bank/active-context.md
  memory-bank/progress.md
  README.md
  docs/architecture.md                  (remove camera mentions if present)
  docs/troubleshooting.md               (remove camera mentions if present)

DELETED:
  components/CameraCapture.tsx
  components/CameraCapture.test.tsx
  components/CameraPermissionsPrompt.tsx
  components/CameraPermissionsPrompt.test.tsx
  lib/camera/getusermedia.ts            (and adjacent tests)
  lib/camera/preprocess-worker.ts       (and adjacent tests)
  lib/camera/                           (the whole directory if empty after deletes)
  test/e2e/camera-capture.spec.ts
```

---

## 8. Quality-gate checklist (run before commit)

- [ ] `pnpm typecheck` — clean
- [ ] `pnpm lint` — clean
- [ ] `pnpm vitest run` — all green (596 + new queue tests)
- [ ] `pnpm test:e2e` — all green (22 + new queue spec)
- [ ] `pnpm eval:deterministic` — still 37/37, gov-warning recall 11/11
- [ ] No tracked file references any prior-art repo or any external
      reviewer tool. `git grep -i "garces\|prior_art\|sebastiangarces"`
      returns empty.

---

## 9. Edge cases & gotchas

- **Invalid `?scenario=<id>`**: fall back to the manual-entry view
  and toast a warning. Do not 404.
- **Direct `/review` entry**: still supported; no breadcrumb, demo
  picker stays visible for manual exploration.
- **Reload during a review**: the URL preserves `?scenario=`, so the
  page restores the same Active Review on reload (image + form
  re-populate from the scenario fetch).
- **IndexedDB unavailable**: queue page falls back to showing every
  scenario as "Pending". Don't crash if `listReviews()` throws.
- **Test fixtures**: e2e specs that previously asserted "Load demo
  scenario" button text on /review still work for direct entry; the
  queue → review flow tests assert the breadcrumb instead.
- **Mobile**: queue table needs to stack on narrow viewports. Use
  `hidden sm:table-cell` for non-essential columns or render rows as
  cards below `sm` breakpoint. Either approach is fine; pick whichever
  reads better.
- **Real-photo manifest schema mismatch**: validate
  `manifest.json` with a Zod schema at module load. If a photo
  references missing application-data fields, throw with a clear
  message naming the filename. Don't silently render rows with
  half-populated forms.
- **Image quality on real photos**: real glare / low-light photos
  will exercise the existing `analyzeImageQuality` heuristics with
  realistic signal — the verification pipeline should produce
  `imageQualityFlags` and demote affected rows to `manual-review`.
  This is a *demo win*, not a bug. Do not silence the flags.
- **Accessibility**: queue rows must be keyboard-navigable (use
  `<a>` not `<div onClick>`). The whole row is the link target;
  ensure proper focus ring.

---

## 10. Definition of done

- Land on `https://prooflens-ai.vercel.app/` → redirected to `/queue`.
- See a table of mock pending applications with APP-IDs, mixing
  synthetic placeholders (APP-2026-NNNN) and real bottle photos
  (APP-2026-RNNN).
- No "Camera" / "Capture from camera" controls anywhere in the UI.
  `git grep -i "camera\|getUserMedia"` returns only references in
  the historical ADR 0004 (now marked superseded) and incidental
  matches in third-party code.
- Click any row → `/review?scenario=<id>` opens with image AND form
  pre-populated, breadcrumb visible.
- For real-photo rows that have image-quality issues (glare /
  low-light / angle), the verification result shows the appropriate
  `imageQualityFlags` and the affected fields demote to
  `manual-review` — proving the heuristics work on real signal.
- Verify the label, override fields if needed, save the decision.
- Return to `/queue` (via nav) → that row's status pill shows
  "Reviewed" (matched by saved `scenarioId`, not brand heuristic).
- Direct entry to `/review` (no `?scenario=`) still works — manual
  uploader, manual form, demo picker all functional.
- All quality gates green; ADR 0008 committed; `PROJECT_BRIEF.md`
  committed; `design/active-review-prototype.html` committed;
  `public/demo-labels/real/` + `manifest.json` committed; no
  prior-art repo references anywhere in tracked files
  (`git grep -i "garces\|prior_art\|sebastiangarces"` returns empty).
