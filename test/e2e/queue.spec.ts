import { expect, test } from "@playwright/test";

/**
 * Queue page — the new home of proofLens.
 *
 * `PROJECT_BRIEF.md` (Sarah Chen): "an agent pulls up an application,
 * looks at the label artwork, and checks that what's on the label
 * matches what's in the application." This spec covers that handoff:
 * land in the queue, click a row, arrive on `/review` with the image
 * preview rendered and the brand input populated from the scenario.
 */

test.describe("queue → review handoff", () => {
  test.beforeEach(async ({ page }) => {
    // Wipe IndexedDB so the Reviewed pill is deterministic for the
    // assertions below.
    await page.goto("/queue");
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("prooflens");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    });
  });

  test("renders synthetic and real-photo rows on /queue", async ({ page }) => {
    await page.goto("/queue");
    await expect(
      page.getByRole("heading", { level: 1, name: /pending applications/i }),
    ).toBeVisible();

    // At least 6 synthetic APP-IDs (APP-2026-NNNN) and at least 1 real
    // photo (APP-2026-RNNN) — the bundled DEMO_SCENARIOS array ships
    // six and the manifest currently includes five real bottle photos.
    const syntheticRows = page.getByText(/^APP-2026-\d{4}$/);
    await expect(syntheticRows.first()).toBeVisible();
    expect(await syntheticRows.count()).toBeGreaterThanOrEqual(6);

    const realRows = page.getByText(/^APP-2026-R\d{3}$/);
    await expect(realRows.first()).toBeVisible();
    expect(await realRows.count()).toBeGreaterThanOrEqual(1);
  });

  test("clicking a synthetic row opens /review pre-loaded with the brand (read-only)", async ({
    page,
  }) => {
    await page.goto("/queue");
    const firstSynthetic = page
      .getByRole("link", { name: /APP-2026-0001/i })
      .first();
    await firstSynthetic.click();

    await expect(page).toHaveURL(/\/review\?scenario=01-spirits-pass/);
    await expect(
      page.getByRole("heading", { level: 1, name: /active review/i }),
    ).toBeVisible();
    // Breadcrumb shows the application id from the queue.
    await expect(page.getByText(/Application Queue/i)).toBeVisible();
    await expect(page.getByText(/APP-2026-0001/)).toBeVisible();
    // Image preview rendered (left column or thumbnail).
    // Desktop viewport renders the full-size preview (alt="Uploaded
    // label preview"); the mobile thumbnail (alt="…— tap to expand")
    // is hidden behind `lg:hidden` at 1280px.
    await expect(
      page.getByAltText("Uploaded label preview", { exact: true }),
    ).toBeVisible();
    // Application data tab is the default and shows the brand value
    // read-only (the queue flow doesn't show an editable input — the
    // application is the source of truth on file in COLA).
    await expect(
      page.getByRole("tab", { name: /application data/i }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByText("Old Tom Distillery", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /verify label/i }),
    ).toBeVisible();
  });

  test("clicking a real-photo row opens /review with the real-* scenario id", async ({
    page,
  }) => {
    await page.goto("/queue");
    const firstReal = page
      .getByRole("link", { name: /APP-2026-R001/i })
      .first();
    await firstReal.click();

    await expect(page).toHaveURL(/\/review\?scenario=real-/);
    await expect(
      page.getByRole("heading", { level: 1, name: /active review/i }),
    ).toBeVisible();
    await expect(page.getByText(/APP-2026-R001/)).toBeVisible();
    // Desktop viewport renders the full-size preview (alt="Uploaded
    // label preview"); the mobile thumbnail (alt="…— tap to expand")
    // is hidden behind `lg:hidden` at 1280px.
    await expect(
      page.getByAltText("Uploaded label preview", { exact: true }),
    ).toBeVisible();
    // Application data tab default + a read-only Brand row populated
    // from the manifest. We don't assert a specific value because the
    // manifest order can change; the contract is the row exists.
    await expect(
      page.getByRole("tab", { name: /application data/i }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(/^brand name$/i).first()).toBeVisible();
  });
});
