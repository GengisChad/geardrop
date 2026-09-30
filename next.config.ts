import type { NextConfig } from "next";
import { readDeploymentContract } from "./src/lib/app-mode";
import { MANAGEMENT_REWRITES } from "./src/lib/management/routes";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Product art is local-only by design: the brief forbids external imagery.
    formats: ["image/avif", "image/webp"],
    // 90 is reserved for the product gallery, where the packshot is shown large.
    qualities: [75, 90],
  },
  typedRoutes: true,
  async redirects() {
    if (readDeploymentContract().surface === "management") return [];
    // Glory Valkerion LF was briefly renamed "Glory Valkyrie"; keep those links working. Temporary, so
    // browsers that cached the earlier opposite redirect do not keep a permanent loop.
    return [
      { source: "/prodotto/glory-valkyrie-lf", destination: "/prodotto/glory-valkerion-lf", permanent: false },
    ];
  },
  async rewrites() {
    if (readDeploymentContract().surface !== "management") return [];
    return [
      ...Object.entries(MANAGEMENT_REWRITES).map(([source, destination]) => ({ source, destination })),
      { source: "/mfa/:path*", destination: "/gestionale/mfa/:path*" },
    ];
  },
  async headers() {
    if (readDeploymentContract().surface !== "management") return [];
    const privateHeaders = [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Cache-Control", value: "private, no-store" },
    ];
    return [
      ...Object.keys(MANAGEMENT_REWRITES).map((source) => ({ source, headers: privateHeaders })),
      { source: "/mfa/:path*", headers: privateHeaders },
      { source: "/auth/callback", headers: privateHeaders },
    ];
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
