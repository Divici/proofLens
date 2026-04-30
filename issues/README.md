# proofLens — Slice plan

> Output of conductor Phase 3 (`to-issues`). Each slice is independently
> grabbable, vertical (touches every layer that needs to change), and
> ends in something demoable.
>
> Compiled: 2026-04-30. Status: **awaiting Phase 3.5 final review**.

---

## Slice index

| # | Slice | Demoable end-state | R-IDs | Blocked by | Effort |
|---|---|---|---|---|---|
| 0001 | Scaffold + dev loop | Blank app deployed; CI green; `pnpm dev/test/test:e2e` work | foundation | — | 3-4h |
| 0002 | Single-label happy path (LLM only) | Upload label → see extracted-fields card | R-001p, R-004 manual, R-006p | 0001 | 4-5h |
| 0003 | Verification + Tesseract + bbox | Demo scenarios 1-4 render with status enum + bbox highlights; gov-warning mutation fuzz green | R-006, R-007, R-008, R-009, R-010, R-013 | 0002 | 8-10h |
| 0004 | Beverage rules + image quality | Spirits/wine/beer routes; demo scenario 6 → "Request Better Image" | R-005, R-011 | 0003 | 4-5h |
| 0005 | Override + IndexedDB history | Override field, save decision, see in history, reopen | R-012, R-014 | 0004 | 5-6h |
| 0006 | Live camera capture | Phone or webcam → snap label → verify | R-003 | 0005 | 4-5h |
| 0007 | Batch flow + Web Worker pool | Drop 30 files + paired CSV → live queue → summary | R-002, R-004 csv, R-017 | 0005 | 6-7h |
| 0008 | Exports (PDF + CSV + JSON) | One-click PDF/JSON; batch ZIP exports | R-015 | 0005 | 4-5h |
| 0009 | Polish: demo + a11y + restricted-network + docs | All 7 demo scenarios from §19 work; keyboard-only flow; Lighthouse a11y ≥ 95; README walks a fresh user through deploy | R-016, R-018, R-019, R-020, R-022 | 0005, 0006, 0007, 0008 | 5-6h |

**Total estimated effort:** 43-53h.

---

## Dependency graph

```
                                            ┌───────────────────────┐
                                            │ 0001 scaffold         │
                                            └───────────┬───────────┘
                                                        ▼
                                            ┌───────────────────────┐
                                            │ 0002 single-label LLM │
                                            └───────────┬───────────┘
                                                        ▼
                                            ┌───────────────────────┐
                                            │ 0003 verify+OCR+bbox  │
                                            └───────────┬───────────┘
                                                        ▼
                                            ┌───────────────────────┐
                                            │ 0004 bev rules + img  │
                                            └───────────┬───────────┘
                                                        ▼
                                            ┌───────────────────────┐
                                            │ 0005 override+history │
                                            └───┬─────────┬─────────┬───┐
                                                ▼         ▼         ▼   │
                                          ┌──────────┐┌────────┐┌───────┐│
                                          │ 0006 cam ││0007 bat││0008 ex││
                                          └────┬─────┘└────┬───┘└───┬───┘│
                                               │           │         │  │
                                               └───────────┼─────────┘  │
                                                           ▼            │
                                            ┌───────────────────────┐  │
                                            │ 0009 polish + docs    │◀─┘
                                            └───────────────────────┘
```

DAG is acyclic. Slices 0006, 0007, 0008 are independent of each other and
can be parallelized.

---

## Milestones

| Milestone | At end of slice | What's demoable |
|---|---|---|
| **AI tracer** | 0003 | Full vertical pipeline working: image → extraction → verification → status enum → bbox highlight on all PRD §19 strict-fail scenarios |
| **Reviewable** | 0005 | Polished single-label review with override + history. The "happy path" persona walkthrough works end-to-end. |
| **Polished demo** | 0009 | All 7 PRD §19 scenarios reproducible from one click; keyboard-only flow; full README + ADRs; deployable from a fresh checkout. |

---

## Phase ordering after build

| Phase | Slice | Skill |
|---|---|---|
| 4 | — | conductor `scaffold` (one-time bootstrap) |
| 5 | 0001…0009 | conductor `subagent-driven-development` per slice |
| 6 | (between 0004/0005 or after 0006) | conductor `deep-modules` + `repo-scan` (architecture audit) |
| 7 | post-0009 | conductor `eval` (Phase 7) |
| 8 | post-eval | user `sweep` (Phase 8) |
| 9 | post-sweep | conductor deploy phase + smoke-test (Phase 9) |

---

## Post-merge work per slice (per the conductor BUILD step)

After each slice merges:
1. Mini-sweep on the slice's files only.
2. Mini-eval on Layer 1 (deterministic checks) scoped to the slice.
3. Telemetry recorded (cost + latency) via `cost-aware-llm-pipeline`.
4. ADR generated via `architecture-decision-records` if architectural decision was made.
5. Memory bank updated.
6. Context budget check; if approaching threshold, write handoff state and prompt user `/clear`.

---

## Cuts / explicit non-goals

These are **not** in any slice and will not be built:

- Real auth, multi-user, multi-tenant
- Server-side review storage (per Marcus IT note)
- Original-image retention (always ephemeral)
- Cross-device sync
- Inngest / background jobs / queues (browser-side Web Worker pool only)
- Cloudflare R2 / object storage
- Postgres / any DB
- Stitch MCP UI generation (manual + iterate from north-star)
- Forward-looking TTB rules (Notices 237/238) — design strictly to today's rules
- Bbox highlights for Manual-Review-only fields (acceptable to omit)
