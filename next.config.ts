import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Dish photo (≤5 MB) and short dish video (≤20 MB) uploads go through Server
    // Actions. Next's default body limit is 1 MB — raise it to cover a clip plus
    // multipart overhead. (Bigger clips would need a direct-to-Storage signed
    // upload; not needed at this size.)
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
