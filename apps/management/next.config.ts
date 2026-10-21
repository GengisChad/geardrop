import type { NextConfig } from "next";
import { assertManagementApplicationSurface } from "@geardrop/runtime-contract";
import { readManagementSupabaseEnv } from "./src/lib/supabase/env";

assertManagementApplicationSurface();
readManagementSupabaseEnv();

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  distDir: ".next",
  typedRoutes: true,
  transpilePackages: ["@geardrop/runtime-contract", "@geardrop/data-contract"],
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Cache-Control", value: "private, no-store" },
    ] }];
  },
};
export default config;
