import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const path = join(process.cwd(), "supabase/migrations/20260718213000_add_store_configuration.sql");

describe("typed store configuration migration", () => {
  it("extends shipping with typed areas and estimates", () => {
    const sql = readFileSync(path, "utf8");
    for (const field of ["enabled_country_codes", "estimate_min_days", "estimate_max_days"]) expect(sql).toContain(field);
    expect(sql).toContain("estimate_min_days <= estimate_max_days");
  });

  it("adds typed singleton store fields without a JSON editor payload", () => {
    const sql = readFileSync(path, "utf8");
    for (const field of ["store_name", "legal_name", "support_email", "maintenance_mode", "upload_max_bytes", "default_seo_title", "instagram_url"]) expect(sql).toContain(field);
    expect(sql).not.toMatch(/settings_payload\s+jsonb/);
  });

  it("adds an owner-only order acceptance checklist RPC", () => {
    const sql = readFileSync(path, "utf8");
    expect(sql).toContain("function public.set_order_acceptance");
    expect(sql).toContain("GD_ORDER_OWNER_REQUIRED");
    expect(sql).toContain("GD_ORDER_CONFIRMATION_INVALID");
    expect(sql).toContain("GD_ORDER_CHECKLIST_INCOMPLETE");
    expect(sql).toContain("order_enablement_checks");
    expect(sql).toContain("store.order_acceptance_changed");
  });
});
