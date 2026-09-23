import type { NextConfig } from "next";
import path from "node:path";

const monorepoRoot = path.resolve(process.cwd(), "../..");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@corrige-plus/config", "@corrige-plus/shared-types"],
  typedRoutes: true,
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
