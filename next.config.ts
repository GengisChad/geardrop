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
    // The mock browser gate serves the cut-outs as they are on disk. Encoding one to AVIF on
    // its first request costs 20-30x a cache hit, the `load` event waits for every image in
    // the viewport, and a catalogue page no earlier test has warmed therefore spends its
    // whole navigation budget inside sharp instead of on the markup the tests assert. The
    // Supabase public gate still runs with the optimiser on, so /_next/image keeps a gate.
    unoptimized: process.env["NEXT_IMAGE_UNOPTIMIZED"] === "1",
  },
  typedRoutes: true,
  async redirects() {
    // Glory Valkerion LF was briefly renamed "Glory Valkyrie"; keep those links working. Temporary, so
    // browsers that cached the earlier opposite redirect do not keep a permanent loop.
    return [
      { source: "/prodotto/glory-valkyrie-lf", destination: "/prodotto/glory-valkerion-lf", permanent: false },
    ];
  },
  async headers() {
    // Baseline security headers for every route. Deliberately conservative: CSP is limited to
    // frame-ancestors (anti-clickjacking) so it cannot break inline JSON-LD or third-party scripts;
    // a full script-src CSP is a separate, tested follow-up. HSTS is already served by Vercel.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Conservative: only disable the Topics ad API. Camera/geolocation are left untouched
          // (e.g. InPost locker search uses the browser's location), so no feature breaks.
          { key: "Permissions-Policy", value: "browsing-topics=()" },
        ],
      },
    ];
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
    // The card-to-product photo transition (lib/view-transitions.ts). Experimental in Next 16;
    // NEXT_PUBLIC_GEARDROP_VIEW_TRANSITIONS=0 turns it off, here and in the components alike.
    viewTransition: process.env["NEXT_PUBLIC_GEARDROP_VIEW_TRANSITIONS"] !== "0",
  },
};

export default nextConfig;
