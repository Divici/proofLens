# 0005: Human override + IndexedDB history

**Blocked by:** 0004
**Blocks:** 0006, 0007, 0008, 0009
**Requirements addressed:** R-012 (override + final decision), R-014 (history)
**Demoable:** Reviewer completes a verification, overrides a field's status with a reason, marks the review Approved/Rejected/Manual Review/Request Better Image, types their name, and saves. A History page lists past reviews with search + filter + reopen + AI-vs-overridden indicator. Closing the tab and reopening shows the saved review still in history.
**Estimated effort:** 5-6h

## Acceptance criteria
- [ ] R-012: per-field override panel
  - Original AI status shown alongside override option
  - New status selectable from the 8-state enum
  - Reason note (free text, ≤ 500 chars)
  - Captures `originalAiStatus`, `humanStatus`, `reason`, `timestamp`, `reviewerName`
  - Visual diff: human-overridden rows highlighted with a distinct border + "human" icon
- [ ] R-012: final-decision panel
  - Four options: Approved / Rejected / Needs Manual Review / Request Better Image
  - Free-text reviewer-name input (required to save) — audit field, not identity
  - Free-text notes (≤ 1000 chars)
  - "Save review" button writes to IndexedDB
- [ ] R-014: IndexedDB schema (`db.review`, `db.batch`, `db.demoData`, `db.settings`) via the `idb` library; matches PRESEARCH §8.1 schema
- [ ] R-014: History page (`app/history/page.tsx`)
  - Lists reviews newest-first
  - Search by brand or reviewer name
  - Filter by overall status, beverage type, has-overrides
  - Reopen a review (returns to `/review` with state hydrated)
  - Each row shows: thumbnail, brand, beverage, overall status, AI-vs-overridden indicator, reviewer name, date
  - Empty state: "No reviews yet — start with /review or /batch"
- [ ] Quota check before save: if IndexedDB usage > 80% of available, show banner "History is nearly full — export and clear before adding more"
- [ ] All 8 status states have visual treatment (color + icon + text per R-018)
- [ ] All quality gates green
- [ ] `STUDY_GUIDE.md` updated: "Why we use IndexedDB instead of a server DB" + "How override audit fields work"

## Files to touch
- **Create:** `lib/storage/db.ts` (idb wrapper, typed)
- **Create:** `lib/storage/review-repo.ts` (CRUD for reviews)
- **Create:** `lib/storage/batch-repo.ts` (CRUD for batches)
- **Create:** `lib/storage/quota.ts` (StorageManager.estimate())
- **Create:** `lib/storage/types.ts` (Review, Batch, Setting types — match PRESEARCH §8.1)
- **Create:** `components/HumanOverridePanel.tsx` (per-field override UI)
- **Create:** `components/FinalDecisionPanel.tsx`
- **Create:** `components/ReviewHistoryList.tsx`, `components/ReviewHistoryRow.tsx`
- **Create:** `app/history/page.tsx`
- **Modify:** `app/review/page.tsx` (integrate override + decision; save flow)
- **Modify:** `components/VerificationDetail.tsx` (each FieldRow gets override toggle)
- **Modify:** `lib/verify/types.ts` (add `humanOverride` to FieldResult)
- **Modify:** `app/page.tsx` (add link to History; show last review summary if any)

## Test specs (write first per TDD)
1. `lib/storage/db.test.ts` — open db; create review; read review; update review with override; delete; list with filters.
2. `lib/storage/review-repo.test.ts` — search by brand, by reviewer, by status; filter by has-overrides.
3. `lib/storage/quota.test.ts` — `getQuotaStatus()` returns `{ used, available, percentage }`.
4. `components/HumanOverridePanel.test.tsx` — RTL: select new status, enter reason, save → emits expected event with reason + timestamp + name.
5. `components/FinalDecisionPanel.test.tsx` — RTL: requires reviewer name; "Save" disabled until name + decision set; "Save" emits the full decision payload.
6. `app/history/page.test.tsx` — renders empty state when no reviews; renders list with thumbnails when reviews present; search filters list.
7. `test/e2e/override-and-history.spec.ts` — verify a label, override the brand field with reason, mark Approved with name "Jane Doe", save, navigate to History, see the row, reopen → state hydrated.

## Notes
- IndexedDB tests run in jsdom + `fake-indexeddb`.
- The Reopen flow rehydrates the full Review object into the `/review` page state; URL pattern: `/review?reviewId=<uuid>`.
- AI-vs-overridden indicator: a small badge in the list row + a distinct border on overridden rows in detail view.
- Reviewer name in the form is sticky per browser (last-used name pre-filled); stored in `db.settings`.
- Save writes thumbnail (256px JPEG) to the review record; thumbnail generation happens client-side via Canvas before save.
- This slice does NOT add export — that's slice 8.
