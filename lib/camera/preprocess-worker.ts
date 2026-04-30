/**
 * Browser-side capture preprocessing for proofLens.
 *
 * This module is the public API used by the camera UI:
 *   - `runCapturePreprocess(blob)` — picks the worker path when supported,
 *     falls back to the main thread otherwise.
 *   - `preprocessCapturedImage(bitmap, opts)` — the core canvas-driven
 *     resize + encode used by both paths. Pure-ish: pluggable canvas
 *     factory makes it unit-testable in jsdom.
 *
 * Why a worker? `OffscreenCanvas` + `convertToBlob` keep the JPEG encode
 * off the main thread on capture, eliminating jank when shutter-pressed
 * on weaker phones. Older Safari (≤ 16.3) doesn't ship `OffscreenCanvas`,
 * so we fall back to the document's main-thread `<canvas>` path.
 *
 * Captured frames have no EXIF (canvas output is always orientation-1)
 * but we still set `image-orientation: from-image` on previews so user-
 * supplied gallery uploads display correctly. The 1568px clamp matches
 * the Anthropic vision input ceiling we use server-side.
 */

export const CAPTURE_MAX_EDGE_PX = 1568;
export const CAPTURE_JPEG_QUALITY = 0.85;
export const CAPTURE_OUTPUT_TYPE = "image/jpeg";

export interface PreprocessedCapture {
  blob: Blob;
  width: number;
  height: number;
}

export interface PreprocessOptions {
  maxEdgePx?: number;
  quality?: number;
  /** Inject a canvas factory so the helper is testable in jsdom. */
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
}

/**
 * Compute output dimensions so the longest edge does not exceed
 * `maxEdge`. Never upscales. Always returns integer dimensions.
 */
export function fitToMaxEdge(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width, height };
  if (width <= maxEdge && height <= maxEdge) {
    return { width, height };
  }
  const scale = maxEdge / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Draw the supplied image source into a canvas, resize ≤ `maxEdgePx`,
 * and encode JPEG at the given quality. Defaults match the Anthropic
 * vision sweet spot (1568px / q85). Closes the source bitmap when done
 * to free GPU memory.
 */
export async function preprocessCapturedImage(
  source: ImageBitmap,
  opts: PreprocessOptions = {},
): Promise<PreprocessedCapture> {
  const maxEdgePx = opts.maxEdgePx ?? CAPTURE_MAX_EDGE_PX;
  const quality = opts.quality ?? CAPTURE_JPEG_QUALITY;
  const { width, height } = fitToMaxEdge(source.width, source.height, maxEdgePx);

  const factory = opts.createCanvas ?? defaultCreateCanvas;
  const canvas = factory(width, height);
  // Make sure dimensions are pinned even if the factory ignored them.
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    closeBitmap(source);
    throw new Error("Unable to acquire 2d canvas context");
  }
  ctx.drawImage(source as unknown as CanvasImageSource, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, CAPTURE_OUTPUT_TYPE, quality);
  closeBitmap(source);
  if (!blob) {
    throw new Error("Canvas failed to encode capture as JPEG.");
  }
  return { blob, width, height };
}

/**
 * Public entry point: take an arbitrary image Blob (from a video frame
 * or a file picker), run it through the worker if `OffscreenCanvas` is
 * available, fall back to the main-thread canvas otherwise.
 */
export async function runCapturePreprocess(
  input: Blob,
): Promise<PreprocessedCapture> {
  if (typeof window === "undefined") {
    throw new Error("runCapturePreprocess must run in the browser");
  }

  if (canUseOffscreen()) {
    try {
      return await runInWorker(input);
    } catch {
      // Worker path is best-effort. Any error (worker spin-up, structured
      // clone, OffscreenCanvas panic) drops to the main-thread fallback
      // so the user always gets a captured image.
    }
  }

  const bitmap = await createImageBitmap(input);
  return preprocessCapturedImage(bitmap);
}

function canUseOffscreen(): boolean {
  if (typeof Worker === "undefined") return false;
  if (typeof OffscreenCanvas === "undefined") return false;
  if (typeof createImageBitmap === "undefined") return false;
  // Firefox shipped `OffscreenCanvas` before `convertToBlob`, so probe
  // for the encode method itself before trusting the worker path.
  try {
    const probe = new OffscreenCanvas(1, 1);
    return typeof probe.convertToBlob === "function";
  } catch {
    return false;
  }
}

/**
 * Test-only export of the feature probe. The probe touches global
 * `OffscreenCanvas` so unit tests need to drive it directly to cover
 * the legacy-Firefox branch.
 */
export function canUseOffscreenForTest(): boolean {
  return canUseOffscreen();
}

/**
 * Spawn the worker (lazy, single instance per caller — the camera UI
 * only fires preprocess once per shutter press), post the Blob, await
 * the encoded result, and tear the worker down.
 *
 * The worker source is inlined as a string + Blob URL so we don't need
 * a separate Webpack/Turbopack worker import that ships an extra chunk.
 */
async function runInWorker(input: Blob): Promise<PreprocessedCapture> {
  const url = URL.createObjectURL(buildWorkerScript());
  const worker = new Worker(url, { type: "module" });
  try {
    return await new Promise<PreprocessedCapture>((resolve, reject) => {
      // Guard against `worker.onerror` firing after `worker.onmessage`
      // (or vice versa). Without this, stray late events would attempt
      // a second settle and surface as noisy unhandled rejections.
      let settled = false;
      const settleOk = (out: PreprocessedCapture) => {
        if (settled) return;
        settled = true;
        resolve(out);
      };
      const settleErr = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      worker.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
        const data = event.data;
        if (data.kind === "ok") {
          settleOk({ blob: data.blob, width: data.width, height: data.height });
        } else {
          settleErr(new Error(data.error));
        }
      };
      worker.onerror = (event) => {
        settleErr(new Error(event.message || "preprocess worker errored"));
      };
      const message: WorkerInboundMessage = {
        blob: input,
        maxEdgePx: CAPTURE_MAX_EDGE_PX,
        quality: CAPTURE_JPEG_QUALITY,
        type: CAPTURE_OUTPUT_TYPE,
      };
      worker.postMessage(message);
    });
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}

interface WorkerInboundMessage {
  blob: Blob;
  maxEdgePx: number;
  quality: number;
  type: string;
}

type WorkerOutboundMessage =
  | { kind: "ok"; blob: Blob; width: number; height: number }
  | { kind: "error"; error: string };

/**
 * Build the worker script body as a Blob. Self-contained: it imports
 * nothing — `OffscreenCanvas`, `createImageBitmap`, and `convertToBlob`
 * are all on the worker global.
 */
function buildWorkerScript(): Blob {
  const src = `
self.onmessage = async (event) => {
  const { blob, maxEdgePx, quality, type } = event.data;
  try {
    const bitmap = await createImageBitmap(blob);
    const w0 = bitmap.width;
    const h0 = bitmap.height;
    let width = w0;
    let height = h0;
    if (Math.max(w0, h0) > maxEdgePx) {
      const scale = maxEdgePx / Math.max(w0, h0);
      width = Math.max(1, Math.round(w0 * scale));
      height = Math.max(1, Math.round(h0 * scale));
    }
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas 2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const out = await canvas.convertToBlob({ type, quality });
    self.postMessage({ kind: "ok", blob: out, width, height });
  } catch (cause) {
    self.postMessage({
      kind: "error",
      error: cause && cause.message ? cause.message : String(cause),
    });
  }
};
`;
  return new Blob([src], { type: "application/javascript" });
}

function defaultCreateCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new Error("Default canvas factory requires a document");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

function closeBitmap(source: ImageBitmap): void {
  // `close` is part of the ImageBitmap interface; jsdom shims may omit it.
  const maybeClose = (source as unknown as { close?: () => void }).close;
  if (typeof maybeClose === "function") {
    try {
      maybeClose.call(source);
    } catch {
      // Defensive — already closed.
    }
  }
}
