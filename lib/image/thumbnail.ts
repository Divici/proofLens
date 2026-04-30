"use client";

/**
 * Client-side 256-px JPEG thumbnail generation for the History list.
 *
 * Browsers happily resize via `<canvas>`. We hold no DOM references — the
 * canvas is created, drawn into, and tossed. The resulting Blob lands
 * directly on the IndexedDB Review record (`thumbnail` field). The
 * uploaded original is never persisted server-side.
 */

export const THUMBNAIL_MAX_EDGE_PX = 256;
const JPEG_QUALITY = 0.82;

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
 * Resize the given image File/Blob to a JPEG thumbnail (longest edge ≤
 * THUMBNAIL_MAX_EDGE_PX). Throws if the browser cannot decode the image
 * (caller should surface a plain-English toast).
 */
export async function generateThumbnail(file: Blob): Promise<Blob> {
  if (typeof window === "undefined") {
    throw new Error("generateThumbnail must run in the browser");
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const { width, height } = fitToMaxEdge(
      img.naturalWidth,
      img.naturalHeight,
      THUMBNAIL_MAX_EDGE_PX,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to acquire 2d canvas context");
    }
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
    if (!blob) throw new Error("Canvas produced an empty thumbnail");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("We could not decode the uploaded image."));
    img.src = src;
  });
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
