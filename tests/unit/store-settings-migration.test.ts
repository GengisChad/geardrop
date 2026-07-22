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

describe("order intake hardening", () => {
  const orderSql = readFileSync(join(process.cwd(), "supabase/migrations/20260718234000_harden_order_and_pricing_boundaries.sql"), "utf8");
  const replacementSql = readFileSync(join(process.cwd(), "supabase/migrations/20260718235000_make_admin_replacements_atomic.sql"), "utf8");

  it("serializes order creation with the operational kill switch", () => {
    expect(orderSql).toContain("for share");
    expect(orderSql).toContain("not intake_enabled");
  });

  it("marks unknowable legacy preorder balances and records future staff changes", () => {
    expect(replacementSql).toContain("reservation_kind='preorder'");
    expect(replacementSql).toContain("balance_kind='preorder',balance_after=null");
    expect(replacementSql).toContain("exact allocation history cannot be reconstructed");
    expect(replacementSql).toContain("products_record_preorder_allocation_change");
    expect(replacementSql).toContain("geardrop.preorder_movement_managed");
  });

  it("keeps machine checks authoritative while allowing seeded manual checks", () => {
    expect(replacementSql).toContain("p_key in ('store_identity','shipping','catalog_stock')");
    expect(replacementSql).not.toContain("p_key <> 'payments'");
  });
});
