import { expect, test } from "@playwright/test";

test.describe("smoke: core routes render", () => {
  test("home page returns 200 and shows the proofLens shell", async ({
    page,
    request,
  }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "proofLens" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "New review" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Batch" })).toBeVisible();
    // /history is a real link in the nav now (slice 0005). The home page
    // also surfaces a "View history" CTA which would resolve, so anchor
    // the assertion to the nav-bar link explicitly.
    await expect(
      page.getByRole("link", { name: "History", exact: true }),
    ).toBeVisible();
  });

  test("/about returns 200 and shows project name and version", async ({
    page,
    request,
  }) => {
    const response = await request.get("/about");
    expect(response.status()).toBe(200);

    await page.goto("/about");
    await expect(
      page.getByRole("heading", { level: 1, name: "proofLens" }),
    ).toBeVisible();
    await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
  });

  test("/api/health responds with JSON shaped { ok, providers, ts }", async ({
    request,
  }) => {
    const response = await request.get("/api/health");
    // Health may return 200 (provider reachable) or 503 (unreachable in CI
    // without an API key). Both are valid — we only assert the contract.
    expect([200, 503]).toContain(response.status());

    const body = await response.json();
    expect(body).toHaveProperty("ok");
    expect(typeof body.ok).toBe("boolean");
    expect(body).toHaveProperty("providers");
    expect(typeof body.providers.openrouter).toBe("boolean");
    expect(typeof body.ts).toBe("string");
    expect(() => new Date(body.ts)).not.toThrow();
  });
});
