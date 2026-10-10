import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as contract from "@geardrop/data-contract";
import { checkSourceImports } from "../../scripts/check-workspace-boundaries";

const names = ["read_access", "inventory_writes", "purchasing_writes", "fulfillment_writes", "pricing_writes", "marketing_writes", "external_effects"] as const;
const rows = () => names.map(feature => ({ feature, enabled: false, updated_at: "2026-09-30T11:00:00Z" }));
function client(data: unknown, status = 200, observe?: (url: string, init?: RequestInit) => void) {
  return createClient<contract.Database>("http://127.0.0.1:54321", "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => {
      observe?.(String(url), init);
      return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    } },
  });
}
describe("management feature control plane", () => {
  it("publishes the fail-closed adapter from the neutral package", () => {
    expect(contract.loadManagementFeatures).toBeTypeOf("function");
    expect(contract.requireManagementFeature).toBeTypeOf("function");
    expect(contract.ManagementFeatureUnavailableError).toBeTypeOf("function");
  });
  it("loads exactly seven flags through the management schema and organization RPC", async () => {
    const data = rows(); data[0]!.enabled = true;
    const flags = await contract.loadManagementFeatures(client(data, 200, (url, init) => {
      expect(new URL(url).pathname).toBe("/rest/v1/rpc/list_management_features");
      expect(new Headers(init?.headers).get("content-profile")).toBe("management_api");
      expect(JSON.parse(String(init?.body))).toEqual({ p_organization_id: 42 });
    }), 42);
    expect(flags).toEqual({ read_access: true, inventory_writes: false, purchasing_writes: false, fulfillment_writes: false, pricing_writes: false, marketing_writes: false, external_effects: false });
    expect(Object.isFrozen(flags)).toBe(true);
    expect(() => contract.requireManagementFeature(flags, "read_access")).not.toThrow();
    for (const feature of names.slice(1)) expect(() => contract.requireManagementFeature(flags, feature)).toThrow("GD_MANAGEMENT_FEATURE_DISABLED");
  });
  it.each([
    ["RPC failure", { message: "private detail", code: "42501" }, 403],
    ["null", null, 200],
    ["missing rows", rows().slice(1), 200],
    ["duplicate rows", [...rows().slice(0, 6), rows()[0]], 200],
    ["unknown enum", [...rows().slice(0, 6), { feature: "future", enabled: true }], 200],
    ["invalid boolean", rows().map((r, i) => i ? r : { ...r, enabled: "true" }), 200],
  ])("fails closed on %s", async (_name, data, status) => {
    await expect(contract.loadManagementFeatures(client(data, status as number), 42)).rejects.toBeInstanceOf(contract.ManagementFeatureUnavailableError);
  });
  it("normalizes a rejected transport without leaking its contents", async () => {
    const db = createClient<contract.Database>("http://127.0.0.1:54321", "test-key", { auth: { persistSession: false }, global: { fetch: async () => { throw new Error("secret detail"); } } });
    await expect(contract.loadManagementFeatures(db, 42)).rejects.toThrow("GD_MANAGEMENT_FEATURE_UNAVAILABLE");
  });
  it("sends the read-access action only to the dedicated RPC", async () => {
    const row = { organization_id: 42, feature: "read_access", enabled: true, updated_at: "2026-09-30T12:00:00Z", updated_by: null };
    const input = { p_organization_id: 42, p_enabled: true, p_expected_updated_at: "2026-09-30T11:00:00Z", p_reason: "Enable read-only access" };
    expect(await contract.setManagementReadAccess(client(row, 200, (url, init) => {
      expect(new URL(url).pathname).toBe("/rest/v1/rpc/set_management_read_access");
      expect(new Headers(init?.headers).get("content-profile")).toBe("management_api");
      expect(JSON.parse(String(init?.body))).toEqual(input);
    }), input)).toEqual(row);
    await expect(contract.setManagementReadAccess(client(null, 403), input)).rejects.toBeInstanceOf(contract.ManagementFeatureUnavailableError);
  });
  it("keeps private off the Data API and includes both schemas in type generation", () => {
    const config = readFileSync(resolve("supabase/config.toml"), "utf8");
    expect(config.match(/^schemas\s*=\s*(.*)$/m)?.[1]).toBe('["public", "graphql_public", "management_api"]');
    const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    expect(pkg.scripts["db:types"]).toContain("--schema public,management_api");
  });
  it("ha TOTP abilitato nel profilo Supabase locale per i test MFA owner (Task 5)", () => {
    const config = readFileSync(resolve("supabase/config.toml"), "utf8");
    // Estrae la sezione [auth.mfa.totp] fino al prossimo header di sezione
    const totpSection = config.match(/\[auth\.mfa\.totp\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? "";
    expect(totpSection, "[auth.mfa.totp] enroll_enabled deve essere true").toMatch(/enroll_enabled\s*=\s*true/);
    expect(totpSection, "[auth.mfa.totp] verify_enabled deve essere true").toMatch(/verify_enabled\s*=\s*true/);
  });
  it("allows neutral package imports but rejects app, Next and undeclared dependencies", () => {
    const file = resolve("packages/data-contract/src/probe.ts");
    expect(checkSourceImports('import type { SupabaseClient } from "@supabase/supabase-js"; import type { Database } from "./database.types";', file, process.cwd())).toEqual([]);
    for (const source of ['import "next/server";', 'import "../../../src/lib/supabase/env";', 'import "../../../apps/management/src/app/page";', 'import "zustand";']) expect(checkSourceImports(source, file, process.cwd()), source).toHaveLength(1);
  });
});
