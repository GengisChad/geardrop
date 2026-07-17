import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readPublicSupabaseEnv } from "@/lib/supabase/env";

describe("Supabase environment", () => {
  it("reads the public URL and publishable key", () => {
    expect(
      readPublicSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
    ).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_test",
    });
  });

  it("rejects a missing public key", () => {
    expect(() => readPublicSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" })).toThrow(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  });

  it("keeps the secret reader in a server-only module", () => {
    const publicSource = readFileSync(join(process.cwd(), "src/lib/supabase/env.ts"), "utf8");
    const secretSource = readFileSync(join(process.cwd(), "src/lib/supabase/env.server.ts"), "utf8");

    expect(secretSource).toContain('import "server-only"');
    expect(secretSource).toContain("SUPABASE_SECRET_KEY");
    expect(publicSource).not.toContain("SUPABASE_SECRET_KEY");
  });
});
