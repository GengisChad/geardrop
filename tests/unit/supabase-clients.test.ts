import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

  it("does not require Supabase environment for the mock storefront", () => {
    const proxy = source("src/proxy.ts");

    // The matcher covers the authenticated surfaces only — staff, customer account and
    // the auth callback. Everything the anonymous storefront serves stays off it, so a
    // mock deployment never reaches for Supabase environment on a catalogue request.
    for (const route of ["/admin/:path*", "/account/:path*", "/auth/:path*", "/api/preview"]) {
      expect(proxy).toContain(route);
    }

    expect(proxy).not.toContain("_next/static");
    expect(proxy).not.toContain('"/:path*"');
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
