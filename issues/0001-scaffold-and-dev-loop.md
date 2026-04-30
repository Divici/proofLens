# 0001: Scaffold and dev loop

**Blocked by:** none
**Blocks:** 0002, 0003, 0004, 0005, 0006, 0007, 0008, 0009
**Requirements addressed:** foundation (no R-ID directly; enables every R-ID)
**Demoable:** Blank app deployed to a Vercel preview URL with `/health` returning `{ ok: true, providers: {...} }` and `/about` showing the project name + a one-paragraph description; `pnpm dev` starts the local dev loop; `pnpm test` and `pnpm test:e2e` both run and pass on a smoke test.
**Estimated effort:** 3-4h

## Acceptance criteria
- [ ] `pnpm create next-app` (or equivalent) initializes Next.js 16 (App Router) + TypeScript strict + Tailwind v4 + ESLint, with `pnpm` as package manager
- [ ] shadcn/ui initialized; `Button`, `Card`, `Input`, `Label`, `Select`, `Toast` components installed
- [ ] Inter loaded via `next/font` and applied site-wide; `ui-monospace` system stack for raw-text excerpts
- [ ] `lib/env.ts` validates `OPENROUTER_API_KEY`, `OPENROUTER_MODEL_PRIMARY`, `OPENROUTER_MODEL_FALLBACK`, `OPENROUTER_MODEL_JUDGE` via `zod` at server-startup; missing → fail-fast with descriptive error
- [ ] `app/api/health/route.ts` returns provider reachability JSON (OpenRouter ping). **Spec amendment 2026-04-30:** the original spec called for a Tesseract.js worker init check here. Tesseract.js runs in the browser per `CLAUDE.md`, so a server-side health probe is misplaced. The probe is dropped from this slice; if a Tesseract reachability indicator is wanted later, it belongs on the client side as part of the `/settings` page in slice 0009.
- [ ] `app/about/page.tsx` server-rendered with project name + tagline + version
- [ ] `app/page.tsx` placeholder shell ("New review / Batch / History" nav, empty content area)
- [ ] Vitest configured with `jsdom` env, RTL, MSW; `pnpm test` runs a smoke test
- [ ] Playwright configured with a smoke spec (`test/e2e/smoke.spec.ts`) that hits `/`, `/about`, `/api/health`; runs in `pnpm test:e2e`
- [ ] CI workflow (`.github/workflows/ci.yml`): typecheck + lint + test + e2e on every push/PR
- [ ] Vercel preview URL deploys on PR; production URL on main; `vercel.json` configures Fluid compute defaults
- [ ] `README.md` initial draft: setup, env vars, run, test, deploy
- [ ] `.env.example` with names only (no values) per `~/.claude/rules/no-env-contents.md`
- [ ] All quality gates green
- [ ] `STUDY_GUIDE.md` initialized (gitignored) with "What we're building" section

## Files to touch
- **Create:** `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `vercel.json`
- **Create:** `app/layout.tsx`, `app/page.tsx`, `app/about/page.tsx`, `app/api/health/route.ts`, `app/globals.css`
- **Create:** `lib/env.ts`
- **Create:** `components/ui/*` (shadcn-installed)
- **Create:** `test/setup.ts`, `test/e2e/smoke.spec.ts`
- **Create:** `.github/workflows/ci.yml`
- **Create:** `.env.example`, `README.md`, `STUDY_GUIDE.md`
- **Modify:** `.gitignore` (add `pnpm-lock.yaml` exclusion or pinning policy as decided)

## Test specs (write first per TDD)
1. `lib/env.test.ts` — `validateEnv()` throws when `OPENROUTER_API_KEY` missing; succeeds when all required vars present.
2. `test/e2e/smoke.spec.ts` — `/` returns 200 and contains the project name; `/about` returns 200; `/api/health` returns 200 with `ok: true`.
3. `app/api/health/route.test.ts` — handler returns 503 when OpenRouter is unreachable (mocked via MSW); returns 200 when reachable.

## Notes
- TS strict mode: `"strict": true`, `"noUncheckedIndexedAccess": true`.
- shadcn install via `pnpm dlx shadcn@latest init` then `pnpm dlx shadcn@latest add button card input label select sonner`.
- Pin Tesseract.js to a recent stable version in package.json (added as build dep here even though it's used in slice 3 — saves a dep-update slice later).
- Use Next.js 16 + React 19 baseline. App Router only, no `pages/`.
- `lib/env.ts` is server-only; do not import from client code.
