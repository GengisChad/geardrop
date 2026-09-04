import { describe, expect, it } from "vitest";
import { generateSupabaseSeed } from "../../scripts/generate-supabase-seed";
import {
  CONTENT_PAGE_SEEDS,
  FOOTER_COLUMN_SEEDS,
  HOMEPAGE_SECTION_SEEDS,
  NAVIGATION_MENU_SEEDS,
} from "../../src/data/content-seed";

describe("full reviewed storefront seed", () => {
  const sql = generateSupabaseSeed();
  const normalized = sql.toLowerCase();

  it("represents the current reviewed public content exactly", () => {
    expect(HOMEPAGE_SECTION_SEEDS).toHaveLength(8);
    expect(NAVIGATION_MENU_SEEDS).toHaveLength(1);
    expect(FOOTER_COLUMN_SEEDS).toHaveLength(4);
    expect(CONTENT_PAGE_SEEDS).toHaveLength(5);
    expect(CONTENT_PAGE_SEEDS.map((page) => page.slug)).toEqual([
      "faq", "spedizioni", "resi", "contatti", "chi-siamo",
    ]);
    expect(CONTENT_PAGE_SEEDS.every((page) => !/<[^>]*>/.test(page.markdownSource))).toBe(true);
  });

  it("generates only truthful public presentation copy", () => {
    for (const stale of [
      "45.000",
      "Più venduti",
      "GEAR//DROP Club",
      "24/48h",
      "spedizione veloce",
      "Testo segnaposto",
    ]) {
      expect(sql).not.toContain(stale);
    }
    expect(sql).not.toContain("('champion-bundle', 'bundle'");
    expect(sql).toContain("Pre-ordini aperti");
    expect(sql).toContain("entro 14 giorni dalla conferma");
    expect(normalized).not.toMatch(/with seed\(section_key, bundle_slug, sort_order\)[\s\S]+?values\s*\)/);
  });

  it("uses stable natural keys and produces deterministic SQL for a second run", () => {
    expect(generateSupabaseSeed()).toBe(sql);
    expect(normalized).toContain("on conflict (section_key) do update");
    expect(normalized).toContain("on conflict (slug) do update");
    expect(normalized).toContain("on conflict (menu_key) do update");
    expect(normalized).toContain("on conflict (column_key) do update");
  });

  it("preserves operational state while new catalogue rows start unavailable", () => {
    expect(normalized).toContain("gd_seed_operated_database");
    expect(normalized).toContain("exists(select 1 from public.audit_events)");
    expect(normalized).toContain("0 as stock_quantity");
    expect(normalized).toContain("values (true, false)");
    expect(normalized).not.toContain("stock_quantity = excluded.stock_quantity");
    expect(normalized).not.toContain("accept_orders = excluded.accept_orders");
    expect(normalized).not.toContain("availability_override = excluded.availability_override");
    expect(normalized).not.toContain("preorder_allocation = excluded.preorder_allocation");
    expect(normalized).not.toContain("active = excluded.active");
    expect(normalized).not.toContain("published = excluded.published");
    expect(normalized).toContain("and updated_by is null");
  });

  it("does not fabricate operational commerce facts", () => {
    for (const table of [
      "orders", "order_items", "coupons", "coupon_redemptions", "promotions",
      "promotion_redemptions", "customer_profiles", "customer_addresses",
      "inventory_movements", "audit_events", "staff_profiles",
    ]) {
      expect(normalized).not.toContain(`insert into public.${table}`);
    }
  });
});
