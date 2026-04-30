import { http, HttpResponse } from "msw";

/**
 * Default handlers — happy-path responses for the providers proofLens
 * talks to. Tests override these as needed.
 */
export const handlers = [
  http.get("https://openrouter.ai/api/v1/models", () => {
    return HttpResponse.json({ data: [] }, { status: 200 });
  }),
];
