import type { NextConfig } from "next";
import { gestionaleRedirectSource, isGestionaleOnly } from "./src/lib/app-mode";

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
    // The management app on its own deployment answers /admin only: every shop page leads there.
    if (isGestionaleOnly()) {
      return [{ source: gestionaleRedirectSource(), destination: "/admin", permanent: false }];
    }
    // Glory Valkerion LF was briefly renamed "Glory Valkyrie"; keep those links working. Temporary, so
    // browsers that cached the earlier opposite redirect do not keep a permanent loop.
    return [
      { source: "/prodotto/glory-valkyrie-lf", destination: "/prodotto/glory-valkerion-lf", permanent: false },
    ];
  },
  async headers() {
    // A private tool: never in a search engine.
    return isGestionaleOnly() ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }] : [];
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
