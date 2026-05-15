import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The preview is served from autoblogtool.iocompute.ai → 5025 on this host.
  // Without this, Next 16 blocks HMR for non-localhost origins in dev.
  allowedDevOrigins: ["autoblogtool.iocompute.ai", "*.iocompute.ai"],
};

export default nextConfig;
