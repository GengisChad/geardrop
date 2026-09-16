import type { NextConfig } from "next";

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
  // Glory Valkyrie LF was first published under a misspelled slug; keep shared links working.
  async redirects() {
    return [
      { source: "/prodotto/glory-valkerion-lf", destination: "/prodotto/glory-valkyrie-lf", permanent: true },
    ];
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
