import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["sharp", "tesseract.js"],
  // Ship the Tesseract.js English traineddata file with the API routes
  // that need it. Without an explicit include the Next file tracer doesn't
  // know `tesseractExtract` reads `public/tessdata/eng.traineddata` at
  // runtime (it's not a JS import), and the file gets pruned from the
  // serverless bundle. Runtime then falls back to a slow CDN fetch.
  outputFileTracingIncludes: {
    "/api/extract-label": ["./public/tessdata/**"],
    "/api/health": ["./public/tessdata/**"],
  },
};

export default nextConfig;
