import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportMenu } from "./ExportMenu";
import {
  makeReviewFixture,
  makeBatchFixture,
} from "@/test/fixtures/review";
import { Toaster } from "@/components/ui/sonner";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  // jsdom doesn't ship URL.createObjectURL — provide one that returns a
  // sentinel so the component's download anchor logic doesn't blow up.
  // Plus a no-op revoke for cleanup.
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:test://download"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

const reviewFixture = makeReviewFixture();
const batchFixture = makeBatchFixture([reviewFixture]);

describe("<ExportMenu>", () => {
  it("renders an Export trigger button", () => {
    render(<ExportMenu mode="single" review={reviewFixture} />);
    const trigger = screen.getByRole("button", { name: /export/i });
    expect(trigger).toBeInTheDocument();
  });

  it("single variant shows PDF + JSON items when opened", async () => {
    const user = userEvent.setup();
    render(<ExportMenu mode="single" review={reviewFixture} />);
    await user.click(screen.getByRole("button", { name: /export/i }));
    expect(await screen.findByRole("menuitem", { name: /pdf/i })).toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: /json/i })).toBeInTheDocument();
    // Should NOT show batch-only options.
    expect(screen.queryByRole("menuitem", { name: /summary csv/i })).toBeNull();
  });

  it("batch variant shows Summary CSV + Per-field CSV + All PDFs + All JSON", async () => {
    const user = userEvent.setup();
    render(
      <ExportMenu
        mode="batch"
        batch={batchFixture}
        reviews={[reviewFixture]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /export/i }));
    expect(
      await screen.findByRole("menuitem", { name: /summary csv/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: /per-?field csv/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: /all pdfs/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: /all json/i }),
    ).toBeInTheDocument();
  });

  it("clicking PDF in single mode triggers a fetch to /api/render-pdf", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );
    render(<ExportMenu mode="single" review={reviewFixture} />);
    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(await screen.findByRole("menuitem", { name: /pdf/i }));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/render-pdf",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("clicking JSON in single mode produces an object URL for download", async () => {
    const user = userEvent.setup();
    render(<ExportMenu mode="single" review={reviewFixture} />);
    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(await screen.findByRole("menuitem", { name: /json/i }));
    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });

  it("clicking Summary CSV in batch mode produces an object URL for download", async () => {
    const user = userEvent.setup();
    render(
      <ExportMenu
        mode="batch"
        batch={batchFixture}
        reviews={[reviewFixture]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(
      await screen.findByRole("menuitem", { name: /summary csv/i }),
    );
    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });

  it("shows a toast on PDF render failure (single mode)", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Server boom" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    render(
      <>
        <Toaster />
        <ExportMenu mode="single" review={reviewFixture} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(await screen.findByRole("menuitem", { name: /pdf/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/could not export|export failed|server boom/i),
      ).toBeInTheDocument();
    });
  });

  it("disables the trigger and announces empty state when batch has no reviews", () => {
    const emptyBatch = makeBatchFixture([]);
    render(<ExportMenu mode="batch" batch={emptyBatch} reviews={[]} />);
    const btn = screen.getByRole("button", { name: /export/i });
    expect(btn).toBeDisabled();
  });

  it("auto-closes the menu after selecting a row", async () => {
    const user = userEvent.setup();
    // Make the action resolve quickly so the menu closes and the busy
    // state clears within the test.
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );
    render(<ExportMenu mode="single" review={reviewFixture} />);
    await user.click(screen.getByRole("button", { name: /export/i }));
    const pdfItem = await screen.findByRole("menuitem", { name: /pdf/i });
    expect(pdfItem).toBeInTheDocument();
    await user.click(pdfItem);
    // The menu should close as soon as the row is selected — not wait
    // for the async action to resolve.
    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: /pdf/i })).toBeNull();
    });
  });

  it("disables every row while one row's action is in flight", async () => {
    const user = userEvent.setup();
    // A pending fetch keeps the busy state alive for the duration of
    // the assertion. We resolve it at the end so the test cleans up.
    let resolveFetch: (response: Response) => void = () => {};
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(window, "fetch").mockReturnValue(fetchPromise);

    render(
      <ExportMenu
        mode="batch"
        batch={batchFixture}
        reviews={[reviewFixture]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /export/i }));
    // Click "All PDFs (zip)" — that one calls fetch and stays pending.
    const allPdfsItem = await screen.findByRole("menuitem", {
      name: /all pdfs/i,
    });
    await user.click(allPdfsItem);

    // Re-open the menu to inspect the row state mid-flight.
    await user.click(screen.getByRole("button", { name: /export/i }));
    await waitFor(() => {
      const summary = screen.queryByRole("menuitem", { name: /summary csv/i });
      // While the fetch is pending the trigger is disabled, so the menu
      // can't reopen — that itself is the gate. If the trigger were
      // somehow open, every row would still carry aria-disabled=true.
      if (summary) {
        expect(summary).toHaveAttribute("aria-disabled", "true");
      } else {
        expect(
          screen.getByRole("button", { name: /export/i }),
        ).toBeDisabled();
      }
    });

    // Resolve the pending fetch so the spinner clears and the test exits.
    resolveFetch(
      new Response(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /export/i }),
      ).not.toBeDisabled();
    });
  });
});
