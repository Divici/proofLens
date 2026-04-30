import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAPTURE_MAX_EDGE_PX,
  CAPTURE_JPEG_QUALITY,
  canUseOffscreenForTest,
  fitToMaxEdge,
  preprocessCapturedImage,
  runCapturePreprocess,
} from "./preprocess-worker";

/**
 * The real worker shells the heavy work to `OffscreenCanvas` /
 * `convertToBlob`. jsdom doesn't ship those, so we cover the public
 * helper surface (sizing math, fallback selection, JPEG defaults) here
 * and rely on the Playwright e2e for the real `OffscreenCanvas` path.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fitToMaxEdge", () => {
  it("scales a wide image down to the max edge", () => {
    expect(fitToMaxEdge(3136, 1568, 1568)).toEqual({ width: 1568, height: 784 });
  });

  it("scales a tall image down to the max edge", () => {
    expect(fitToMaxEdge(1568, 3136, 1568)).toEqual({ width: 784, height: 1568 });
  });

  it("never upscales", () => {
    expect(fitToMaxEdge(800, 600, 1568)).toEqual({ width: 800, height: 600 });
  });

  it("handles a square image at the boundary", () => {
    expect(fitToMaxEdge(1568, 1568, 1568)).toEqual({ width: 1568, height: 1568 });
  });

  it("rounds dimensions to the nearest integer", () => {
    const out = fitToMaxEdge(3000, 2001, 1568);
    expect(Number.isInteger(out.width)).toBe(true);
    expect(Number.isInteger(out.height)).toBe(true);
  });
});

describe("constants", () => {
  it("targets the documented Anthropic vision limit (1568px)", () => {
    expect(CAPTURE_MAX_EDGE_PX).toBe(1568);
  });

  it("uses JPEG quality 0.85 to stay within ~200 KB at 1568px", () => {
    expect(CAPTURE_JPEG_QUALITY).toBeCloseTo(0.85, 5);
  });
});

describe("preprocessCapturedImage (main-thread fallback)", () => {
  it("uses a provided ImageBitmap source and returns a JPEG Blob via canvas", async () => {
    const blob = new Blob(["jpeg"], { type: "image/jpeg" });

    // Stub a 3000×2000 ImageBitmap-shape source so the resize math runs.
    const bitmap = { width: 3000, height: 2000, close: vi.fn() } as unknown as
      ImageBitmap;
    const drawImage = vi.fn();
    const getContext = vi.fn().mockReturnValue({ drawImage });
    const toBlob = vi.fn((cb: (b: Blob) => void) => cb(blob));

    const fakeCanvas = { getContext, toBlob } as unknown as HTMLCanvasElement;

    const result = await preprocessCapturedImage(bitmap, {
      maxEdgePx: 1568,
      quality: 0.85,
      createCanvas: (w, h) => {
        // Canvas mutated by the helper; assert sizing was applied.
        (fakeCanvas as unknown as { width: number }).width = w;
        (fakeCanvas as unknown as { height: number }).height = h;
        return fakeCanvas;
      },
    });

    expect(getContext).toHaveBeenCalledWith("2d");
    expect(drawImage).toHaveBeenCalledOnce();
    expect((fakeCanvas as unknown as { width: number }).width).toBe(1568);
    // 2000 / 3000 * 1568 = 1045.33 → rounded
    expect((fakeCanvas as unknown as { height: number }).height).toBe(1045);
    expect(toBlob).toHaveBeenCalledOnce();
    expect(result.blob).toBe(blob);
    expect(result.width).toBe(1568);
    expect(result.height).toBe(1045);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("ignores a late onerror that fires after a successful onmessage", async () => {
    // Simulate the runInWorker code path with a fake Worker that fires
    // onmessage first then onerror — without the settle guard, the second
    // event would resolve a second promise and trigger an unhandled
    // rejection. We assert runCapturePreprocess resolves cleanly to the
    // payload from the first event.
    type Listener<T> = ((event: T) => void) | null;
    type FakeWorker = {
      onmessage: Listener<MessageEvent<unknown>>;
      onerror: Listener<{ message: string }>;
      postMessage: (msg: unknown) => void;
      terminate: () => void;
    };
    const okBlob = new Blob(["jpeg"], { type: "image/jpeg" });

    const originalWorker = globalThis.Worker;
    const originalCreateBitmap = (
      globalThis as { createImageBitmap?: unknown }
    ).createImageBitmap;
    const originalOffscreen = (globalThis as { OffscreenCanvas?: unknown })
      .OffscreenCanvas;
    const originalCreateURL = URL.createObjectURL;
    const originalRevokeURL = URL.revokeObjectURL;

    let workerInstance: FakeWorker | null = null;
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    // Stub OffscreenCanvas + convertToBlob so canUseOffscreen is true.
    class StubOffscreenCanvas {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      convertToBlob() {
        return Promise.resolve(okBlob);
      }
    }
    (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas =
      StubOffscreenCanvas;
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap =
      vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() }));

    (globalThis as unknown as { Worker: unknown }).Worker = function (
      this: FakeWorker,
    ) {
      this.onmessage = null;
      this.onerror = null;
      this.postMessage = () => {
        // Defer until the caller has wired up the handlers.
        queueMicrotask(() => {
          this.onmessage?.({
            data: { kind: "ok", blob: okBlob, width: 100, height: 100 },
          } as MessageEvent<unknown>);
          // Late stray error — must be ignored.
          this.onerror?.({ message: "late stray error" });
        });
      };
      this.terminate = () => {};
      workerInstance = this;
    } as unknown as typeof Worker;

    try {
      const out = await runCapturePreprocess(
        new Blob(["x"], { type: "image/jpeg" }),
      );
      expect(out.blob).toBe(okBlob);
      expect(out.width).toBe(100);
      expect(out.height).toBe(100);
      // Verifies the fake worker was actually used.
      expect(workerInstance).not.toBeNull();
    } finally {
      (globalThis as unknown as { Worker: unknown }).Worker = originalWorker;
      (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap =
        originalCreateBitmap;
      (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas =
        originalOffscreen;
      URL.createObjectURL = originalCreateURL;
      URL.revokeObjectURL = originalRevokeURL;
    }
  });

  it("ignores a late onmessage that fires after onerror", async () => {
    type Listener<T> = ((event: T) => void) | null;
    type FakeWorker = {
      onmessage: Listener<MessageEvent<unknown>>;
      onerror: Listener<{ message: string }>;
      postMessage: (msg: unknown) => void;
      terminate: () => void;
    };

    const originalWorker = globalThis.Worker;
    const originalCreateBitmap = (
      globalThis as { createImageBitmap?: unknown }
    ).createImageBitmap;
    const originalOffscreen = (globalThis as { OffscreenCanvas?: unknown })
      .OffscreenCanvas;
    const originalCreateURL = URL.createObjectURL;
    const originalRevokeURL = URL.revokeObjectURL;

    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    class StubOffscreenCanvas {
      width = 1;
      height = 1;
      convertToBlob() {
        return Promise.resolve(new Blob(["x"]));
      }
    }
    (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas =
      StubOffscreenCanvas;
    // Force the worker path to trip but still need createImageBitmap stub
    // for the main-thread fallback we land in after the worker error.
    const fallbackBitmap = { width: 50, height: 50, close: vi.fn() } as unknown;
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap =
      vi.fn(async () => fallbackBitmap);

    (globalThis as unknown as { Worker: unknown }).Worker = function (
      this: FakeWorker,
    ) {
      this.onmessage = null;
      this.onerror = null;
      this.postMessage = () => {
        queueMicrotask(() => {
          // Reject first via onerror.
          this.onerror?.({ message: "first error" });
          // Then a stray late success — must NOT cause a second settle.
          this.onmessage?.({
            data: {
              kind: "ok",
              blob: new Blob(["late"]),
              width: 999,
              height: 999,
            },
          } as MessageEvent<unknown>);
        });
      };
      this.terminate = () => {};
    } as unknown as typeof Worker;

    try {
      // The worker rejects, so runCapturePreprocess falls back to the
      // main-thread path. We don't care about the output — the assertion
      // is "no unhandled promise rejection from the late onmessage".
      // If the guard is missing, the test runner surfaces an
      // UnhandledRejection and fails.
      await expect(
        runCapturePreprocess(new Blob(["x"], { type: "image/jpeg" })),
      ).rejects.toThrow();
    } finally {
      (globalThis as unknown as { Worker: unknown }).Worker = originalWorker;
      (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap =
        originalCreateBitmap;
      (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas =
        originalOffscreen;
      URL.createObjectURL = originalCreateURL;
      URL.revokeObjectURL = originalRevokeURL;
    }
  });
});

describe("canUseOffscreen feature probe", () => {
  function withGlobals<T>(
    overrides: { Worker?: unknown; OffscreenCanvas?: unknown; createImageBitmap?: unknown },
    fn: () => T,
  ): T {
    const g = globalThis as unknown as Record<string, unknown>;
    const originals: Record<string, unknown> = {
      Worker: g.Worker,
      OffscreenCanvas: g.OffscreenCanvas,
      createImageBitmap: g.createImageBitmap,
    };
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete g[key];
      } else {
        g[key] = value;
      }
    }
    try {
      return fn();
    } finally {
      for (const key of Object.keys(originals)) {
        if (originals[key] === undefined) {
          delete g[key];
        } else {
          g[key] = originals[key];
        }
      }
    }
  }

  class ModernOffscreenCanvas {
    width = 1;
    height = 1;
    convertToBlob() {
      return Promise.resolve(new Blob(["x"]));
    }
  }
  class LegacyOffscreenCanvas {
    width = 1;
    height = 1;
    // No convertToBlob — older Firefox shipped OffscreenCanvas without it.
  }

  it("returns false when OffscreenCanvas is missing", () => {
    withGlobals(
      {
        Worker: function FakeWorker() {},
        OffscreenCanvas: undefined,
        createImageBitmap: () => Promise.resolve({}),
      },
      () => {
        expect(canUseOffscreenForTest()).toBe(false);
      },
    );
  });

  it("returns false when OffscreenCanvas exists but convertToBlob is missing (Firefox legacy)", () => {
    withGlobals(
      {
        Worker: function FakeWorker() {},
        OffscreenCanvas: LegacyOffscreenCanvas,
        createImageBitmap: () => Promise.resolve({}),
      },
      () => {
        expect(canUseOffscreenForTest()).toBe(false);
      },
    );
  });

  it("returns true when OffscreenCanvas + convertToBlob are both present", () => {
    withGlobals(
      {
        Worker: function FakeWorker() {},
        OffscreenCanvas: ModernOffscreenCanvas,
        createImageBitmap: () => Promise.resolve({}),
      },
      () => {
        expect(canUseOffscreenForTest()).toBe(true);
      },
    );
  });
});

describe("preprocessCapturedImage (main-thread fallback)", () => {
  it("rejects when the canvas cannot encode a Blob", async () => {
    const bitmap = { width: 100, height: 100, close: vi.fn() } as unknown as
      ImageBitmap;
    const drawImage = vi.fn();
    const getContext = vi.fn().mockReturnValue({ drawImage });
    const toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(null));
    const fakeCanvas = { getContext, toBlob } as unknown as HTMLCanvasElement;

    await expect(
      preprocessCapturedImage(bitmap, {
        maxEdgePx: 1568,
        quality: 0.85,
        createCanvas: () => fakeCanvas,
      }),
    ).rejects.toThrow(/encode/i);
  });
});
