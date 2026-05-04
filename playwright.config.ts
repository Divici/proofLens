import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — two modes.
 *
 *  - Default mode: `pnpm test:e2e`
 *      Runs the `chromium` project against a Next dev server with full
 *      Tesseract enabled (the local-dev path).
 *
 *  - Production-sim mode: `pnpm test:e2e:prod-sim`
 *      Sets PROOFLENS_PROD_SIM=1, which:
 *        (a) replaces the project list with a single `production-sim`
 *            project that runs only the specs which round-trip through
 *            user-visible flows on Vercel (queue, single-label,
 *            verification, override+history, scenario-switch).
 *        (b) boots the dev server with VERCEL=1 so route.ts takes the
 *            `skipTesseract` branch (ADR 0007) — words=[] and rawText
 *            is the LLM gov-warning capture only.
 *        (c) runs on a separate port so it never reuses an existing
 *            local dev server that lacks VERCEL=1 (the silent-attach
 *            failure mode that bit us pre-Phase-6).
 *
 * Regression net for the production-or-cut rule (see APPROACH.md
 * "Trade-offs and known limitations" — Tesseract.js disabled on Vercel).
 */

const PROD_SIM = process.env.PROOFLENS_PROD_SIM === "1";

// Distinct port for prod-sim so a local dev server on :3000 (without
// VERCEL=1) is never reused. `reuseExistingServer: false` further
// guarantees a fresh boot under the prod-sim env.
const DEFAULT_PORT = PROD_SIM ? 3210 : 3000;
const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Specs that must pass under the Vercel-flavored deploy. Picked because
 * each one walks the user through a flow the agent uses on the live
 * URL. Smoke + batch + export + keyboard-only stay on the default
 * project for now (see plan §3 #9 / #10 — those audits land later).
 */
const PROD_SIM_SPECS = [
  "**/queue.spec.ts",
  "**/single-label.spec.ts",
  "**/override-and-history.spec.ts",
  "**/scenario-switch.spec.ts",
  "**/verification.spec.ts",
];

export default defineConfig({
  testDir: "./test/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: PROD_SIM
    ? [
        {
          name: "production-sim",
          testMatch: PROD_SIM_SPECS,
          use: {
            ...devices["Desktop Chrome"],
          },
        },
      ]
    : [
        {
          name: "chromium",
          use: {
            ...devices["Desktop Chrome"],
          },
        },
      ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    // Always boot fresh under prod-sim — a reused server without
    // VERCEL=1 would silently mask the very regressions this project
    // exists to catch.
    reuseExistingServer: PROD_SIM ? false : !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    // Ensure env validation passes during smoke runs even on a fresh
    // checkout. The smoke test asserts contract shape only — the
    // health route may return 503 when the key is a placeholder, which
    // is intentional.
    env: {
      // Trigger the route's `skipTesseract` branch (app/api/extract-
      // label/route.ts:234) by setting VERCEL in the dev server env.
      ...(PROD_SIM ? { VERCEL: "1" } : {}),
      OPENROUTER_API_KEY:
        process.env.OPENROUTER_API_KEY ?? "playwright-smoke-key",
      OPENROUTER_MODEL_PRIMARY:
        process.env.OPENROUTER_MODEL_PRIMARY ?? "anthropic/claude-haiku-4.5",
      OPENROUTER_MODEL_FALLBACK:
        process.env.OPENROUTER_MODEL_FALLBACK ?? "anthropic/claude-sonnet-4.6",
      OPENROUTER_MODEL_JUDGE:
        process.env.OPENROUTER_MODEL_JUDGE ?? "anthropic/claude-haiku-4.5",
      OPENROUTER_BASE_URL:
        process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    },
  },
});
