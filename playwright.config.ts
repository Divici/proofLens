import { defineConfig, devices } from "@playwright/test";

// Use a non-default port so dev runs on a developer's machine (which
// commonly has another :3000 server) don't collide with the e2e suite.
const PORT = Number(process.env.PORT ?? 3210);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

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
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    // Ensure env validation passes during smoke runs even on a fresh
    // checkout. The smoke test asserts contract shape only — the
    // health route may return 503 when the key is a placeholder, which
    // is intentional.
    env: {
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
