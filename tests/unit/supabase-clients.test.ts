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
});
