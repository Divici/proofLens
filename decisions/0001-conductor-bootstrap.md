# 0001: Conductor Bootstrap

**Date:** 2026-04-30
**Status:** accepted

## Context

Setting up project infrastructure for proofLens via the conductor.
proofLens is an AI-powered alcohol-label verification web app for TTB
compliance reviewers, targeting a deployed live URL. Source-of-truth
specs are `PRD.md` (input), `ALIGNMENT.md` (gitignored, Phase 0),
`PRESEARCH.md` (Phase 2 lock), `RESEARCH.md` (Phase 1 brief), and
`issues/0001..0009` (Phase 3 vertical slices).

## Decision

- **Workflow:** Conductor-driven build (`~/.claude/skills/conductor/`).
- **Stack:** Next.js 16 + TypeScript strict + Tailwind v4 + shadcn/ui +
  pnpm.
- **AI gateway:** OpenRouter; Claude Haiku 4.5 primary, Sonnet 4.6
  fallback, Haiku judge.
- **OCR:** Tesseract.js in-process (gov-warning ground truth — defends
  100%-recall requirement against vision-LLM caps normalization).
- **Persistence:** IndexedDB only. No server-side user data, no auth.
  Per Marcus IT note: "not storing anything sensitive for this exercise."
- **Quality gates:** `pnpm typecheck && pnpm lint && pnpm test &&
  pnpm test:e2e`. CI mutation fuzz on the gov-warning matcher
  (`fast-check`) is part of `pnpm test`.
- **Memory bank:** 6-file persistence in `memory-bank/`
  (project-brief, product-context, system-patterns, tech-context,
  active-context, progress).
- **Decision log:** `decisions/` ADR folder, generated via
  `architecture-decision-records` skill at slice boundaries.
- **Directory choice:** Standard (`memory-bank/` + `decisions/`).
- **TDD:** mandatory (`~/.claude/rules/tdd.md`).
- **Worktree isolation:** yes — slice agents work in worktrees per
  `superpowers:using-git-worktrees`.
- **Auto-commit:** mandatory at end of task
  (`~/.claude/rules/commit-message.md`).
- **Build cadence:** per-milestone — pause after slices 0003, 0005,
  0009.
- **Deployment:** Vercel Hobby + Fluid compute.

## Consequences

- The conductor's autonomous build flow handles end-to-end scaffold →
  build → audit → eval → sweep → deploy with three milestone pauses.
- Knowledge persists across sessions via the memory bank.
- Architectural decisions are traceable via ADRs in `decisions/`.
- Worktree isolation lets parallel slice agents work without
  interfering with each other or the user's main checkout.
- Quality gates are enforced automatically via CI and the conductor's
  per-slice review step (fresh `code-reviewer` agent in clean context
  per slice).
- The IT-note constraint (no server-side user data) drops a substantial
  chunk of typical Next.js infrastructure (DB, ORM, auth, object
  storage, queue) from the build. The simpler stack is intentional, not
  underbuilt.
- Following `forge-defaults` baseline keeps the surface familiar to
  future maintainers; only deviations from defaults are justified
  here.

## References

- `PRD.md`, `ALIGNMENT.md` (gitignored, local working doc),
  `PRESEARCH.md`, `RESEARCH.md`
- `research-findings/01-ttb-regulatory.md` through `04-architecture-infra.md`
- `issues/0001-scaffold-and-dev-loop.md` through `0009-polish-and-docs.md`
- `issues/README.md` (slice DAG and milestones)
- `~/.claude/rules/*.md`
