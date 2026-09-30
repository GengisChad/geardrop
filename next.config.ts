import type { NextConfig } from "next";
import { assertStorefrontApplicationSurface } from "@geardrop/runtime-contract";

assertStorefrontApplicationSurface();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@geardrop/runtime-contract", "@geardrop/data-contract"],
  images: {
    // Product art is local-only by design: the brief forbids external imagery.
    formats: ["image/avif", "image/webp"],
    // 90 is reserved for the product gallery, where the packshot is shown large.
    qualities: [75, 90],
  },
  typedRoutes: true,
  async redirects() {
    // Glory Valkerion LF was briefly renamed "Glory Valkyrie"; keep those links working. Temporary, so
    // browsers that cached the earlier opposite redirect do not keep a permanent loop.
    return [
      { source: "/prodotto/glory-valkyrie-lf", destination: "/prodotto/glory-valkerion-lf", permanent: false },
    ];
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
