import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/server";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// jsdom doesn't ship URL.createObjectURL / revokeObjectURL by default. The
// History row + thumbnail helpers expect them — supply trivial polyfills
// so component-level RTL tests don't blow up.
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:test://thumbnail";
}
if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = () => {};
}

// jsdom's Blob does not implement `arrayBuffer()` (older spec). The
// export client reads thumbnails via `await blob.arrayBuffer()` in
// shared logic; polyfill against the constructor prototype.
if (
  typeof Blob !== "undefined" &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof (Blob.prototype as any).arrayBuffer !== "function"
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Blob.prototype as any).arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(this as unknown as Blob);
    });
  };
}

// jsdom doesn't ship window.matchMedia — sonner needs it on mount.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}
