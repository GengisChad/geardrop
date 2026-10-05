import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Product art is local-only by design: the brief forbids external imagery.
    formats: ["image/avif", "image/webp"],
    // 90 is reserved for the product gallery, where the packshot is shown large.
    qualities: [75, 90],
    // The mock browser gate serves the cut-outs as they are on disk. Encoding one to AVIF on
    // its first request costs 20-30x a cache hit, the `load` event waits for every image in
    // the viewport, and a catalogue page no earlier test has warmed therefore spends its
    // whole navigation budget inside sharp instead of on the markup the tests assert. The
    // Supabase public gate still runs with the optimiser on, so /_next/image keeps a gate.
    unoptimized: process.env["NEXT_IMAGE_UNOPTIMIZED"] === "1",
  },
  typedRoutes: true,
  // Glory Valkerion LF was briefly renamed "Glory Valkyrie"; keep those links working. Temporary, so
  // browsers that cached the earlier opposite redirect do not keep a permanent loop.
  async redirects() {
    return [
      { source: "/prodotto/glory-valkyrie-lf", destination: "/prodotto/glory-valkerion-lf", permanent: false },
    ];
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
