# Product Context

## Problem

TTB compliance agents review high volumes of alcohol-label applications,
verifying that label artwork matches submitted application data. The
work is highly repetitive (brand name, ABV, net contents, etc.) but
requires human judgment for nuanced cases. Existing automation has failed
when too slow, hard to use, or misaligned with workflow.

## Solution

A fast, simple, explainable AI assistant that:

1. Extracts structured fields from a label image
2. Compares each field against expected application values
3. Flags issues with status (Pass / Likely Match / Warning / Fail / Missing /
   Low Confidence / Needs Manual Review / Not Required), confidence, and
   plain-English explanation
4. Strictly validates the § 16.21 government health warning text
5. Detects image-quality problems and routes uncertain cases to manual
   review
6. Lets the human override any field, add notes, and make final decisions
7. Supports batch processing for high-volume submissions
8. Captures everything in a browser-local audit trail

## Target users

### Primary — Compliance agent
A TTB reviewer at a desk who processes labels across a queue. Wants to
spot mismatches faster, handle imperfect images, and make confident final
decisions. Pain points: manual checking is repetitive; existing systems
are slow; bad software makes the job harder.

### Secondary — Compliance team lead
Wants to evaluate AI-assisted review for consistency and throughput
gains. Wants to know where AI is reliable and where human judgment must
take over.

### Secondary — IT / technical evaluator
Wants to understand system boundaries, data handling, and integration
readiness. Cares about minimal sensitive-data storage and standalone
deployment.

## UX principles (PRD §8)

1. **Human-in-the-loop first.** AI assists; never decides.
2. **Fast enough to beat manual review.** ~5s single-label target.
3. **Simple enough for non-technical agents.** Obvious from first screen;
   avoid AI jargon.
4. **Explain every flag.** Every issue answers: what field, what was
   expected, what was found, why flagged, how confident, what next.
5. **Strict and nuanced fields are different.** Gov-warning is exact;
   brand-name capitalization is "Likely Match", not Fail.

## Aesthetic north-star

Calm internal-tool / federal filing. Neutral palette + a single accent
for status. High contrast, clear typography (Inter), dense-but-orderly
information design, generous click targets. Reference vibe: Stripe
Dashboard, Linear, Plaid Console.
