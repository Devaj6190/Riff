import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false, // hides the dev-only "N" button; build and runtime errors still show
};

export default nextConfig;
