import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Dish-photo uploads go through Server Actions. Next's default body limit is
    // 1 MB, which would reject a real café photo (we allow up to 5 MB) — raise it
    // to comfortably cover a photo plus multipart overhead.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
