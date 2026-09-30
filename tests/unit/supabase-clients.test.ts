import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { config, proxy } from "@/proxy";
import * as supabaseProxy from "@/lib/supabase/proxy";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Supabase client boundaries", () => {
  it("keeps request-scoped and privileged clients server-only factories", () => {
    const server = source("src/lib/supabase/server.ts");
    const admin = source("src/lib/supabase/admin.ts");

    expect(server).toContain('import "server-only"');
    expect(server).toContain("export async function createSupabaseServerClient");
    expect(admin).toContain('import "server-only"');
    expect(admin).toContain("export function createPrivilegedSupabaseClient");
    expect(server).not.toMatch(/export const \w*supabase/i);
    expect(admin).not.toMatch(/export const \w*supabase/i);
  });

  it("refreshes auth with verified claims and never authorizes from getSession", () => {
    const proxy = source("src/lib/supabase/proxy.ts");
    const guards = source("src/lib/auth/guards.ts");
    const combined = `${proxy}\n${guards}`;

    expect(proxy).toContain("auth.getClaims()");
    expect(guards).toMatch(/auth\.(getClaims|getUser)\(\)/);
    expect(combined).not.toContain("getSession(");
  });

  it("classifies all requests without requiring Supabase for the mock storefront", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_SURFACE", "storefront");
    vi.stubEnv("LEGACY_ADMIN_MODE", "enabled");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const refresh = vi.spyOn(supabaseProxy, "refreshSupabaseSession");
    try {
      expect(config.matcher).toEqual(["/:path*"]);
      for (const route of ["/negozio", "/admin", "/account", "/auth/callback", "/api/preview"]) {
        const response = await proxy(new NextRequest(`https://geardropshop.it${route}`));
        expect(response.status, route).toBe(200);
      }
      expect(refresh.mock.calls.map(([request]) => request.nextUrl.pathname)).toEqual([
        "/admin", "/account", "/auth/callback", "/api/preview",
      ]);
    } finally {
      refresh.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("binds every Supabase client boundary to the generated Database type", () => {
    const browser = source("src/lib/supabase/client.ts");
    const server = source("src/lib/supabase/server.ts");
    const admin = source("src/lib/supabase/admin.ts");
    const publicClient = source("src/lib/supabase/public.ts");
    const proxy = source("src/lib/supabase/proxy.ts");
    const guards = source("src/lib/auth/guards.ts");
    const provider = source("src/lib/commerce/supabase-provider.ts");

    expect(browser).toContain("createBrowserClient<Database>");
    expect(server).toContain("createServerClient<Database>");
    expect(admin).toContain("createClient<Database>");
    expect(publicClient).toContain("createClient<Database>");
    expect(proxy).toContain("createServerClient<Database>");
    expect(guards).toContain("SupabaseClient<Database>");
    expect(provider).toContain("SupabaseClient<Database>");
  });
});
