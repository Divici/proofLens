import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * Node-side MSW server used by Vitest.
 * Tests can override handlers per-test via `server.use(...)`.
 */
export const server = setupServer(...handlers);
