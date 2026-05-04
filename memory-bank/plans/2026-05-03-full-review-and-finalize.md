# Plan — Full review and finalize

> Self-contained audit + finalization plan. The user reported that
> small gaps and bugs keep surfacing that should have been caught
> earlier. This plan exists to do a thorough sweep, identify every
> gap, and tighten the implementation so the deployed app matches
> what the project brief asks for. Companion to ADR 0009 and the
> extraction-hardening plan; supersedes neither.

**Goal:** Produce a deployed, polished proofLens that passes a
strict review pass with zero "small gaps" — no features that work
locally but break on Vercel, no inconsistent verdicts, no UX dead
ends, no stale state across navigation, and a production-environment
test suite that catches the kinds of regressions we keep shipping.

**Driving principle from the user (this session, paraphrased):**
> "Any tools that don't work in production should not be in the app
> or a working alternative should be used (e.g. bbox)."

So the rule is **production-or-cut**. If a feature only works in
local dev, either remove the affordance, or build a Vercel-friendly
alternative. No half-features.

---

## 1. Why this plan exists

Recent regressions all share a shape: code that works locally fails
in production because production runs without Tesseract (per ADR 0007
— Vercel's Rust bytecode runtime can't resolve tesseract.js v5's CJS
worker chain). Three concrete examples already known:

1. **Function-phrase scanner** (commit `781c668`) reads `rawText` for
   approved verbs. On Vercel `rawText` is just the gov-warning text
   (the LLM fallback). Verbs printed elsewhere on the label aren't
   in `rawText`. The scanner false-warns on every label. Confirmed
   from the user's screenshot today (Stone's Throw "BREWED AND
   BOTTLED BY ..." flagged as missing the verb).

2. **BBox click-to-highlight** depends on Tesseract `words[]`. On
   Vercel `words = []` so the click does nothing visually. The UI
   still surfaces the affordance ("Click a field on the right to
   highlight its source on the label"), creating a dead promise.

3. **Hardening plan's ABV cross-check** would have the same shape
   (rawText comparison fails on Vercel where rawText is sparse). I
   noted it in the plan's edge cases but it's worth surfacing as a
   first-class concern.

The pattern: **when I add a feature, I prove it works with a test
fixture that simulates Tesseract's full output. Then I deploy and
the feature is broken because production doesn't have Tesseract.**

This plan exists to (a) catch every existing instance of this and
fix or remove it, (b) audit related correctness/consistency issues
across the whole app while we're at it, and (c) build a regression
suite that runs in a Vercel-flavored environment so this class of
bug can't slip through again.

---

## 2. Audit phases — what we'll review

The work is broken into phases. Each phase is independent and can
be tackled in its own commit. The phases are roughly ordered by
"what would the user notice first" — so phase 1 (production-or-cut)
is highest priority, phase 7 (docs) is lowest.

### Phase 1 — Production-vs-local parity (highest priority)

**Goal:** Identify every feature/affordance that depends on Tesseract
or any other local-only dependency. For each, decide: fix-on-Vercel
or remove-from-app. No third option.

Inventory pass:
- [ ] Grep for `ocr.words`, `ocr.text`, `rawText`, `bboxFor`,
  `tesseractExtract`, `Tesseract` in lib/* and app/*
- [ ] List every grader / UI affordance that consumes those values
- [ ] For each, run a "Vercel simulation" check — set
  `process.env.VERCEL=1`, hit the route, observe what the consumer
  receives. Either it works (sparse rawText is enough) or it's
  broken.

Confirmed entries (from the audit so far):

| Feature | Path | Vercel status | Decision needed |
|---|---|---|---|
| BBox click-to-highlight on left-column image | `LabelImagePreview` SVG overlay; `bboxFor()` populates from `words[]` | Broken — words is empty | Either: (a) derive bboxes from LLM evidence quotes via fuzzy match against gov-warning text only (very limited), (b) make the LLM return rough bboxes per field (prompt + schema change), (c) **REMOVE the click-to-highlight affordance and the "Click a field..." copy on Vercel.** Per the user's rule, (c) is the default. |
| Function-phrase scanner | `lib/verify/nuanced/bottler-function-phrase.ts` | Broken — false-warns | Two options: (a) extend the haystack to include the LLM's `bottlerName.evidenceQuote` (typically contains the verb), (b) extend the LLM extraction prompt to add a `bottlerStatement` field that captures verb+name explicitly. **(a) is the small fix; (b) is cleaner long-term. Pick one — both are documented in this plan.** |
| Hardening plan's ABV/net-contents cross-check | Planned in `2026-05-03-extraction-hardening.md` | Would be broken on Vercel | Re-target the cross-check at the LLM's `evidenceQuote` rather than `rawText`. The hardening plan needs an update before any task is implemented. |
| Gov-warning matcher | `lib/verify/strict/gov-warning.ts` consumes `rawText` | Works — `rawText` IS the LLM gov-warning capture on Vercel | Keep, but add a note in the matcher that on Vercel its input is the LLM's rendering of the warning, not pure OCR. |
| Image-quality heuristics | `lib/quality/heuristics.ts` reads from sharp | Works — runs on the preprocessed buffer | Keep |

Phase 1 deliverables:
- One or more commits that fix or remove the affected features
- Updated extraction-hardening plan (new revision) with corrected
  cross-check approach
- A new note in ADR 0007 (or a new ADR 0010) summarizing the
  "production-or-cut" rule and why we removed bbox click-to-
  highlight from production

### Phase 2 — Status / verdict consistency

**Goal:** Every status badge, pill color, and explanation string
across the app reads consistently. The reviewer should be able to
glance at any surface (verdict pill, FAB, FinalDecisionPanel border,
field-row pill) and have an unambiguous mental model.

Inventory pass:
- [ ] Map every `FieldStatus` -> displayed pill label across:
  - `FieldRow` (per-field pill)
  - `VerificationDetail` (overall pill)
  - History list rows
  - PDF / CSV exports
- [ ] Map every `OverallStatus` -> pill, FAB color, FinalDecisionPanel
  border color
- [ ] Confirm naming consistency: do we say "Pass" or "Match" for
  the same condition? "Fail" or "Reject"? "Manual review" or
  "Needs manual review"?

Known gaps:

- **"Match" vs "Pass" inconsistency.** The screenshot shows the ABV
  row with a "Match" badge — but ABV is a strict field, and `pass`
  status is canonically "Pass". The status engine's nuanced row
  produces `pass` (which renders "Match") AND strict rows can
  produce `pass` (which sometimes renders as "Pass"). Decide one
  consistent label and apply.
- **"Likely match" similarity 100%** — a row whose normalised
  comparison is byte-equal but isn't case-equal renders as
  "Likely match". This is a rung-1-of-the-ladder hit (post-
  normalisation byte equality). The label is technically right
  but visually weak — the reviewer reads "Likely match" + "100%"
  as ambiguous. Consider promoting rung-1 to "Pass" when
  similarity == 1.0.
- **Per-field strict vs nuanced labels.** ABV is strict; brand is
  nuanced. The reviewer doesn't see this distinction in the pill
  vocabulary. Decide whether to expose it (e.g., "Strict pass" vs
  "Likely match") or keep it hidden.
- **"Flagged" pill** — used by the warning-overlay path (e.g.,
  function-phrase warning, standards-of-fill). Is "Flagged" the
  right word, or should it be "Warning"? The 8-state enum has
  `warning` as a status but the UI says "Flagged" in some places.

Phase 2 deliverables:
- Decision document (one ADR or a section in this plan) listing
  the canonical label per status
- Code changes that align all surfaces

### Phase 3 — Grader correctness sweep

**Goal:** Walk every demo + real-photo scenario through the verify
pipeline and confirm the field-level verdicts match what the brief
intends. Not just "tests pass" — actually run the deployed app and
visually confirm.

Inventory pass:
- [ ] Synthetic demo scenarios (6) — run each on production, capture
  screenshots, confirm verdicts
- [ ] Real-photo scenarios (5 in current manifest) — same
- [ ] Cross-scenario navigation — switch between scenarios in
  various orders, confirm no state bleed
- [ ] Save + reopen round trip — verify save persists every field
  including warning RuleOutcomes; reopen renders identically

Known issues to validate during this sweep:

- The user's reported `38% / 76 proof` symptom — was this the
  staleness bug (now fixed in `4d2ea49`) or an actual hallucination?
  Re-test scenario 03 (Cedar Ridge ABV mismatch) on production and
  confirm.
- Real-photo scenarios with image-quality issues (Ron Zacapa angled,
  glare) — do they correctly demote to manual-review with the
  "spot-check" copy (not "request better image")?
- Real-photo scenarios with non-US country (Bacardi/Puerto Rico,
  Ron Zacapa/Guatemala) — does the country-of-origin row enforce
  the required rule (vs falling through to optional)?

Phase 3 deliverables:
- A verification spreadsheet (tracked in repo or in this plan)
  with rows per scenario and columns per field, capturing the
  expected vs actual verdict and confidence
- Bug fix commits for any divergence

### Phase 4 — UX / interaction sweep

**Goal:** Every interaction in the app does what its UI promises.
No dead clicks, no false instructions, no unreachable states.

Inventory pass per interactive element:
- [ ] Queue rows — click → /review with correct scenario; status pill
  reflects IndexedDB Reviewed state correctly
- [ ] Tabs (Application data | Results) — switch correctly, tab=
  persists in URL, results tab disabled when status=idle
- [ ] FAB — appears only on success, smooth-scrolls to FinalDecisionPanel
  anchor, color matches overall verdict
- [ ] FinalDecisionPanel — name + decision required to enable Save;
  border color matches overall
- [ ] HumanOverridePanel — open via field-row click; reviewer name
  back-filled on save (not required at edit time)
- [ ] LabelImagePreview click-to-highlight — works on success path
  WITH bboxes (currently only on local dev — see Phase 1)
- [ ] ImageLightbox — Esc + backdrop click both close; mobile
  thumbnail tap to open
- [ ] LabelUploader — drag/drop + click to pick; only renders in
  direct flow (queue flow shows read-only)
- [ ] ExportMenu — visible only after save; PDF, JSON, CSV all download
- [ ] History reopen — pulls IndexedDB record, hydrates page state,
  preserves activeTab/scenarioId
- [ ] Direct /review entry (no `?scenario=`) — uploader, manual form,
  demo picker all functional

Known gaps:
- **The "Click a field on the right to highlight its source on the
  label" copy** appears under the LabelImagePreview even when bbox
  is dead (Vercel). False instruction. Either remove the copy on
  Vercel or fix bbox.
- **Mobile responsive** — was last touched in the
  `refactor(review): two-column tabbed layout` commit. Has not
  been retested since.
- **Keyboard navigation** — recent UI additions (FAB, tabs,
  ApplicationDataView) — were they retested for keyboard-only?

Phase 4 deliverables:
- A walkthrough document (tracked) listing every interaction and
  its observed behavior across desktop + mobile
- Bug fix commits

### Phase 5 — Persistence + export round-trip

**Goal:** Every saved Review record contains everything needed to
recreate the verdict, and exports faithfully render every status
and warning we now produce.

Inventory pass:
- [ ] Save a review with each new RuleOutcome kind:
  - `bottler_function_phrase_missing`
  - `net_contents_non_standard_fill`
  - `abv_cross_check_disagreement` (if/when Phase 1 lands the
    re-targeted cross-check)
- [ ] Reopen the saved review — confirm the field-row explanation
  prose matches what was originally rendered
- [ ] Export PDF — confirm new RuleOutcome kinds appear in the audit
  trail with the right template strings
- [ ] Export JSON — confirm shape includes new fields (scenarioId,
  the new outcomes)
- [ ] Export CSV — confirm column headers + values
- [ ] Batch flow — drop 5+ files via /batch, run, save, reopen via
  /history, export ZIP

Known issues:
- **`Review.scenarioId` field** added in commit `bc47ee4`-ish was
  the queue-redesign work. Does the PDF template render it? Does
  the JSON export include it?
- **Export schema** — was last touched in slice 0008. Has not been
  re-touched since the warning-overlay additions (commits
  `ceabd31`, `781c668`).

Phase 5 deliverables:
- Snapshot tests for each export format with a fixture Review that
  exercises every RuleOutcome kind
- Bug fixes if any are missing

### Phase 6 — Test coverage that catches Vercel regressions

**Goal:** The kinds of bugs the user has been reporting (function-
phrase false-warns on Vercel) should fail in CI, not in production.

Inventory pass:
- [ ] List every test that runs against `extracted` + `rawText` —
  do any test fixtures simulate the **Vercel-flavored** rawText
  (i.e., gov-warning only)?
- [ ] List every E2E spec — none currently set
  `process.env.VERCEL=1` for the test webServer.

Proposed additions:
- A new vitest test suite at
  `lib/verify/pipeline.production-env.test.ts` — every key grader
  is tested against (extracted, rawText='just the gov warning')
  and asserts the verdict still makes sense.
- A new playwright project `production-sim` — sets
  `webServer.env.VERCEL='1'` and runs a subset of e2e specs
  against the sparse-rawText environment.
- A pre-deploy CI gate — both above must pass before push to main.

Phase 6 deliverables:
- New test suite + playwright project
- CI workflow update if applicable
- One regression test for each of the Phase 1 / Phase 2 / Phase 3
  bugs that surfaces here so they can't recur silently

### Phase 7 — Docs / memory bank reconciliation

**Goal:** README, ADRs, and memory-bank reflect the current state.
A future reviewer should be able to read the docs and have an
accurate picture of what works in production.

Inventory pass:
- [ ] README — does it still describe features that are now removed
  (e.g., bbox highlight if Phase 1 removes it)?
- [ ] ADR 0007 — needs a "production-or-cut" rule note
- [ ] ADR 0009 — needs an addendum if Phase 1 changes the function-
  phrase scanner approach
- [ ] memory-bank/active-context.md — current?
- [ ] memory-bank/progress.md — current?
- [ ] CLAUDE.md (in `.claude/`) — module list current after the
  recent code additions/removals?

Phase 7 deliverables:
- Updated README, ADRs, memory bank
- A short "what we reviewed and changed" summary at the top of
  active-context.md

### Phase 8 — Eval re-run + final smoke

**Goal:** Confirm the deterministic eval still passes (37/37) and
the production smoke still hits 11/11 gov-warning recall.

- [ ] `pnpm eval:deterministic` — run, attach results to memory-bank
- [ ] Re-run the Phase-9 production smoke (the 11-mutation gov-warning
  recall test against the deployed instance) — capture output
- [ ] If either regresses, fix before declaring "done"

Phase 8 deliverables:
- Eval result snapshot in memory-bank
- Production smoke confirmation

---

## 3. Concrete, ranked bug list (what we already know is broken)

This is the running list of issues found during the audit. Each
item gets fixed during the relevant phase above; this list also
serves as the "definition of done" for Phases 1-3.

### Bugs (must fix)

1. **Function-phrase scanner false-warns on Vercel** — the haystack
   only contains the gov-warning text on production. Fix: include
   the LLM's `bottlerName.evidenceQuote` in the haystack (small
   change), OR add a dedicated `bottlerStatement` field to the
   extraction schema (bigger change). Phase 1.

2. **BBox click-to-highlight is a dead UI on Vercel** — the
   "Click a field on the right to highlight its source on the
   label" copy and the cursor pointer on field rows promise an
   interaction that does nothing. Per the user's rule, **remove
   the affordance on Vercel** — render the LabelImagePreview
   without the SVG overlay container, drop the help-text copy.
   Local dev keeps the bbox functionality unchanged. Phase 1.

3. **Hardening plan's ABV cross-check would also break on Vercel**
   — re-target at the LLM's `alcoholContentText.evidenceQuote`
   (and equivalents) instead of `rawText`. Phase 1 (update plan).

### Inconsistencies (probably-must-fix)

4. **"Match" vs "Pass" pill labels** — same `pass` status renders
   different labels in different places. Pick one. Phase 2.

5. **Rung-1 (post-normalisation byte equality, similarity 1.0)
   renders as "Likely match"** — visually weak for what is
   essentially a perfect match modulo case/punctuation. Consider
   promoting to "Pass" or labeling the row differently. Phase 2.

6. **"Flagged" vs "Warning"** — terminology drift. Pick one. Phase 2.

### Risks (worth confirming)

7. **Save + reopen round trip with new RuleOutcome kinds** — has
   not been tested. Phase 5.

8. **Export formats with new RuleOutcomes** — PDF, JSON, CSV
   fixtures don't include the new kinds. Phase 5.

9. **Mobile responsive for the new tabbed layout** — last touched
   ~5 commits ago, not retested. Phase 4.

10. **Keyboard navigation for FAB, tabs, ApplicationDataView** —
    not retested since their introduction. Phase 4.

11. **Reviewer-name back-fill on overrides** — works for the
    happy path, but what about: name typed → save → open new
    override → save again? Phase 5.

### Nice-to-haves (consider if scope allows)

12. **Add a `bottlerStatement` field to the LLM schema** — cleaner
    than reusing `bottlerName.evidenceQuote` for the function-phrase
    scan, and unblocks the broader hardening plan (cleaner cross-
    check anchor).

13. **Pre-deploy CI gate** — Phase 6's production-sim playwright
    project runs as a required check before push.

14. **Reviewer-name persistence in IndexedDB settings** — already
    implemented in `lib/storage/settings-repo.ts`. Sanity-check
    that it survives the recent changes.

---

## 4. Sequencing — recommended order

Strict order isn't required, but this ordering minimizes rework:

1. **Phase 1 first** (production-or-cut). Removes broken
   features so the user isn't seeing false warnings while the
   rest of the audit runs.
2. **Phase 6** (Vercel-sim test infrastructure). Build the
   regression net BEFORE the rest of the audit so any bugs
   surfaced in Phase 2/3/4/5 get a regression test added in the
   same commit.
3. **Phase 2** (status consistency). UI vocabulary lockdown.
4. **Phase 3** (grader correctness). Walk every scenario.
5. **Phase 4** (UX sweep).
6. **Phase 5** (persistence + export).
7. **Phase 7** (docs).
8. **Phase 8** (eval + smoke). Final gate before declaring done.

---

## 5. What I want before starting any code

Three explicit decisions from the user when they're back:

1. **Production-or-cut on bbox click-to-highlight** — remove
   the affordance on Vercel (default), or build an LLM-bbox
   alternative (significant prompt + UI work)?

2. **Function-phrase scanner approach** — extend haystack to
   include `evidenceQuote` (small fix, lands today), or add a
   `bottlerStatement` schema field (cleaner, requires prompt
   change + Zod schema update + extraction-hardening plan
   update).

3. **Status pill vocabulary** — strict `pass` says "Pass",
   nuanced `pass` says "Match" today. Pick one. (My recommendation:
   "Pass" for both — simpler vocabulary; the strict-vs-nuanced
   distinction is internal architecture and shouldn't bleed into
   the reviewer's label.)

Once those three are decided, Phase 1 can ship in 2-3 hours and
Phase 6's test infrastructure in another 2-3 hours. The rest is
walking through the audit and fixing what we find.

---

## 6. Success criteria

This plan is "done" when:

- [ ] Every interactive element has been walked through on
      production (Vercel) and confirmed working
- [ ] Every demo scenario + real-photo scenario produces the
      expected verdict on production
- [ ] Cross-scenario navigation produces no state bleed
- [ ] The Vercel-sim playwright project passes
- [ ] The deterministic eval still hits 37/37
- [ ] Gov-warning recall still 11/11 on production smoke
- [ ] No grader / UI affordance produces a false signal on Vercel
      (no false warnings, no dead clicks, no false instructions)
- [ ] README + ADRs + memory bank accurate
- [ ] One ADR (0010 or addendum to 0007) records the "production-
      or-cut" rule for future agents

---

## 7. Reference — files most likely touched

```
HIGH IMPACT (Phase 1):
  lib/verify/nuanced/bottler-function-phrase.ts
  app/api/extract-label/route.ts
  components/LabelImagePreview.tsx (bbox affordance)
  components/FieldRow.tsx (cursor + click-to-highlight wiring)
  decisions/0007-ocr-prod-vs-local.md (addendum)
  memory-bank/plans/2026-05-03-extraction-hardening.md (rev)

PHASE 2:
  components/FieldRow.tsx (pill label normalization)
  components/VerificationDetail.tsx (verdict pill)
  lib/verify/explain/templates.ts (suggested action wording)

PHASE 6:
  test/e2e/scenario-switch.spec.ts (already exists; expand)
  test/e2e/production-sim/*.spec.ts (NEW)
  lib/verify/pipeline.production-env.test.ts (NEW)
  playwright.config.ts (add `production-sim` project)

PHASE 7:
  README.md
  decisions/0007-ocr-prod-vs-local.md
  decisions/0009-grader-audit-warnings-and-deferrals.md
  memory-bank/active-context.md
  memory-bank/progress.md
  .claude/CLAUDE.md (module list)
```

---

## 8. Open questions (for the user, when back)

1. The three decisions in §5 above.

2. Is "polished demo for the brief" enough, or do you want the
   hardening plan (Tesseract cross-check, fallback model wiring,
   etc.) to also land before declaring final? Those were ranked
   medium-priority but they meaningfully reduce the OCR-
   hallucination surface that the brief calls out via Sarah's
   "if we can't get results back in about 5 seconds, nobody's
   going to use it" + Marcus's restricted-network constraints.

3. Mobile testing surface — do we have a phone we can actually
   walk through, or is browser-DevTools-mobile-emulation enough?

---

## 9. Notes for whoever picks this up

- The user explicitly said "production-or-cut" for any feature
  that doesn't work on Vercel. Default to cut. Don't try to
  fix-on-Vercel unless the cost is small AND there's a clear win.
- Every plan-internal decision should be captured in an ADR or
  an addendum to an existing ADR — the user is reviewing this
  carefully and wants the rationale traceable.
- The biggest existing risk is **regression amnesia**: the same
  class of bug (Vercel-vs-local mismatch) keeps recurring. Phase 6
  exists specifically to break that cycle. Don't skip it.
- This plan is self-contained but cross-references two earlier
  plans:
  - `2026-05-03-grader-audit-and-fixes.md` (already executed)
  - `2026-05-03-extraction-hardening.md` (not yet executed; needs
    revision in Phase 1)

End of plan.
