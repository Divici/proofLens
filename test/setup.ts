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
