# Slice 0001 — Scaffold and dev loop — execution plan

## Source-of-truth spec

`issues/0001-scaffold-and-dev-loop.md` — read in full before starting.

## Branch

`slice/0001-scaffold` off `main`. Worked in
`.worktrees/slice-0001-scaffold/`.

## Task graph

Most work in this slice is sequential because Next.js scaffolding owns
the project root. Three parallelizable tracks emerge after Track A
completes; one execution agent handles all three serially because
parallelism gain is small relative to context coordination cost.

### Track A — Next.js + base config (sequential, must come first)
1. `pnpm create next-app .` with App Router, TS, Tailwind v4, ESLint,
   `--use-pnpm`, `--src-dir=false`
2. Confirm `next@16.x`, `react@19.x`, `typescript@5.x`,
   `tailwindcss@^4.0.0` versions in `package.json`; bump if needed
3. Configure `tsconfig.json` strict mode + `noUncheckedIndexedAccess`
4. Configure `next.config.ts` with Fluid compute defaults
5. Init shadcn/ui (`pnpm dlx shadcn@latest init`); install Button, Card,
   Input, Label, Select, Sonner components
6. Apply Inter via `next/font`; site-wide
7. Create `app/layout.tsx` (root), `app/page.tsx` (placeholder shell),
   `app/about/page.tsx`, `app/api/health/route.ts`
8. Add `lib/env.ts` with Zod-validated env shape (no values)
9. Add `.env.example` with names only
10. Add Tesseract.js + sharp + zod + idb to `package.json` (used in later
    slices but pinned here so we don't have a dep-update slice)

### Track B — Test infra
1. Install Vitest + @testing-library/react + @testing-library/jest-dom +
   @testing-library/user-event + jsdom + msw + happy-dom (as fallback)
2. Configure `vitest.config.ts` with jsdom env, RTL setup file
3. Write `test/setup.ts` (RTL matchers, MSW server)
4. Write `lib/env.test.ts` (failing-tests-first per TDD rule)
5. Write `app/api/health/route.test.ts` (failing-tests-first)
6. Implement `lib/env.ts` and the health Route Handler to make tests
   pass
7. Install Playwright + browsers; configure `playwright.config.ts`
8. Write `test/e2e/smoke.spec.ts` against `/`, `/about`, `/api/health`

### Track C — CI + docs
1. `.github/workflows/ci.yml` with typecheck + lint + test + e2e jobs
2. Initial `README.md` (clone → install → run → test → deploy)
3. Initial `STUDY_GUIDE.md` (gitignored) with "What we're building"
4. `vercel.json` for Fluid compute defaults

## Acceptance gate

All criteria from `issues/0001-scaffold-and-dev-loop.md` must be checked
off. Specifically:
- `pnpm typecheck` clean
- `pnpm lint` clean
- `pnpm test` green (Vitest)
- `pnpm test:e2e` green (Playwright smoke)
- `git push` deploys to Vercel preview URL with `/health` returning 200

## Out of scope (do not start)

- Single-label flow logic — that's slice 0002
- Tesseract.js usage — pinned in package.json only, used in slice 0003
- Any UI beyond the scaffold shell — slice 0002 onwards
- Camera capture, batch flow, exports, history — later slices

## TDD reminder

Per `~/.claude/rules/tdd.md`: failing test first for every behavioral
change. Scaffolding files (config, layout templates) are
non-behavioral and don't need a test-first; library functions
(`lib/env.ts`) and API handlers (`/api/health`) DO need tests first.

## Commit conventions

Per `~/.claude/rules/commit-message.md`: imperative + lowercase first
word + Co-Authored-By Claude. Multiple commits within the slice are
fine; a single squash at merge time is not the model — `git merge
--no-ff` preserves slice history.

## Estimated effort

3-4h for an experienced agent. If running long, it's likely the
shadcn install or Playwright browser install hitting network/disk
slowness — wait it out, don't kill.

## Files touched (final list at completion)

To be enumerated in the slice's merge commit body.
