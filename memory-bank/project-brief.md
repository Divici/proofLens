# proofLens — Project Brief

## What we're building

A polished web app that helps TTB compliance reviewers verify that uploaded
alcohol-label artwork matches expected application data. The app extracts
visible label fields, compares them against expected values per TTB rules
(Parts 4 / 5 / 7), flags issues with explanations and confidence, surfaces
image-quality problems, and supports human override and final decision.

## Goals

- Reduce routine verification work for compliance agents
- Make edge cases easier to inspect than manual review
- Be fast (≤5s p50 single-label) and simple enough for non-technical agents
- Keep the human responsible for final decisions
- Demonstrate AI reliability with explainable output

## Core requirements (R-001 through R-022)

See `PRESEARCH.md` §2 for the full registry. Highlights:

- R-001 Single label upload + verification flow
- R-002 Batch (≤250 files, 10 concurrent)
- R-003 Live camera capture (rear cam mobile, webcam desktop)
- R-009 Government warning strict validation (100% recall)
- R-014 Browser-local review history (IndexedDB)
- R-015 PDF + CSV + JSON exports
- R-021 Deployed live URL
- R-022 Restricted-network posture

## Hard constraints

- Verdict accuracy ≥ 95% on a hand-labeled golden set ≥ 30 labels
- p50 ≤ 5.0s, p95 ≤ 8.0s end-to-end
- ≤ $0.05 AI cost per label
- 100% recall on government-warning strict-fail
- Marcus IT note: "not storing anything sensitive for this exercise" →
  zero server-side user data; IndexedDB-only persistence; ephemeral
  originals
- No COLA integration
- Polished product (per `complete-product-default` rule) — not a
  v1/MVP; no scope cuts unless explicitly directed

## Out of scope (do not build)

- Real auth / multi-user / multi-tenant
- Cross-device sync
- Original image retention (always ephemeral)
- Forward-looking TTB Notices 237/238 (not yet final)
- Server-side review storage
