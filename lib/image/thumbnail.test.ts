import { describe, expect, it } from "vitest";
import { THUMBNAIL_MAX_EDGE_PX, fitToMaxEdge } from "./thumbnail";

describe("fitToMaxEdge", () => {
  it("scales a wide image to the max edge", () => {
    const out = fitToMaxEdge(1024, 512, 256);
    expect(out).toEqual({ width: 256, height: 128 });
  });

  it("scales a tall image to the max edge", () => {
    const out = fitToMaxEdge(512, 1024, 256);
    expect(out).toEqual({ width: 128, height: 256 });
  });

  it("does not upscale a small image", () => {
    const out = fitToMaxEdge(100, 50, 256);
    expect(out).toEqual({ width: 100, height: 50 });
  });

  it("uses the documented thumbnail edge by default", () => {
    expect(THUMBNAIL_MAX_EDGE_PX).toBe(256);
  });
});
