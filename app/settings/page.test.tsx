import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import SettingsPage from "./page";

describe("SettingsPage", () => {
  it("renders the page heading and OpenRouter row", async () => {
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
    render(<SettingsPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /settings/i }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("provider-row-openrouter")).toBeInTheDocument();
    });
  });

  it("shows Reachable for openrouter when /api/health returns ok=true", async () => {
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
    render(<SettingsPage />);
    await waitFor(() => {
      const row = screen.getByTestId("provider-row-openrouter");
      expect(row).toHaveTextContent(/reachable/i);
    });
  });

  it("shows Unreachable for openrouter when /api/health reports it as down", async () => {
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
    render(<SettingsPage />);
    await waitFor(() => {
      const row = screen.getByTestId("provider-row-openrouter");
      expect(row).toHaveTextContent(/unreachable/i);
    });
  });

  it("falls back to Unreachable for openrouter when /api/health throws", async () => {
    server.use(
      http.get("/api/health", () => HttpResponse.error()),
    );
    render(<SettingsPage />);
    await waitFor(() => {
      const row = screen.getByTestId("provider-row-openrouter");
      expect(row).toHaveTextContent(/unreachable/i);
    });
  });
});
