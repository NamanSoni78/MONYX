import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async headers() {
    return [
      // CRITICAL: COEP + COOP must be set on EVERY route (HTML pages
      // AND assets), otherwise SharedArrayBuffer is unavailable. SAB
      // is required for multi-threaded WASM (onnxruntime-web with
      // numThreads > 1). Without it, ONNX silently degrades to
      // single-threaded — which still works, but is 3-4x slower.
      // Without COEP/COOP, even single-threaded WASM can fail to load
      // depending on browser. So we set these headers globally.
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
      {
        source: "/ort-wasm/:path*",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/UVR_MDXNET_KARA_2.onnx",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
      {
        source: "/mp3-worker.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000" },
        ],
      },
    ];
  },
};

export default nextConfig;
