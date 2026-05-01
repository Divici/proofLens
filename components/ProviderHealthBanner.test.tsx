import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { ProviderHealthBanner } from "./ProviderHealthBanner";

describe("ProviderHealthBanner", () => {
  it("renders nothing when openrouter is reachable", async () => {
    server.use(
      http.get("/api/health", () =>
        HttpResponse.json(
          {
            ok: true,
            providers: { openrouter: true },
            ts: new Date().toISOString(),
          },
          { status: 200 },
        ),
      ),
    );
    const { container } = render(<ProviderHealthBanner />);
    // Wait one tick to ensure the fetch resolved.
    await new Promise((r) => setTimeout(r, 0));
    // No alert at any point during a healthy probe.
    await waitFor(() => {
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });
  });

  it("renders an alert when openrouter is reported unreachable", async () => {
    server.use(
      http.get("/api/health", () =>
        HttpResponse.json(
          {
            ok: false,
            providers: { openrouter: false },
            ts: new Date().toISOString(),
          },
          { status: 503 },
        ),
      ),
    );
    render(<ProviderHealthBanner />);
    await waitFor(() => {
      expect(
        screen.getByRole("alert", { name: /provider unreachable/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/ai extraction is unavailable/i)).toBeInTheDocument();
  });

  it("renders an alert when /api/health throws", async () => {
    server.use(http.get("/api/health", () => HttpResponse.error()));
    render(<ProviderHealthBanner />);
    await waitFor(() => {
      expect(
        screen.getByRole("alert", { name: /provider unreachable/i }),
      ).toBeInTheDocument();
    });
  });
});
