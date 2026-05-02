import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["sharp", "tesseract.js"],
  // Ship Tesseract assets with the API routes that need them.
  //
  //   1. `public/tessdata/**` — the bundled eng.traineddata file
  //      (langPath points here via VERCEL_URL self-host).
  //   2. `node_modules/tesseract.js-core/**` — the WASM core files. In
  //      Node mode tesseract.js loads the core via standard `require()`
  //      (`getCore.js` in the worker script) — `corePath` is browser-
  //      only. Without an explicit trace include, Next's bundler omits
  //      the .wasm binaries because the require is dynamic
  //      (`require('tesseract.js-core/tesseract-core-simd-lstm')`),
  //      not statically resolvable. The function then hangs at cold-
  //      start because the require() can't find the WASM file.
  //   3. `node_modules/tesseract.js/src/worker-script/**` — the Node-mode
  //      worker entrypoint that getCore.js lives inside; same dynamic-
  //      require problem.
  outputFileTracingIncludes: {
    "/api/extract-label": [
      "./public/tessdata/**",
      "./node_modules/tesseract.js-core/**",
      "./node_modules/tesseract.js/src/worker-script/**",
    ],
    "/api/health": ["./public/tessdata/**"],
    "/api/diagnose": [
      "./public/tessdata/**",
      "./node_modules/tesseract.js-core/**",
      "./node_modules/tesseract.js/src/worker-script/**",
    ],
  },
};

export default nextConfig;
