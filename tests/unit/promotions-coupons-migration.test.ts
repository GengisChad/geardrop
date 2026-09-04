import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260718185745_add_promotions_and_coupon_rules.sql"),
  "utf8",
).replaceAll("\r\n", "\n");

describe("promotions, coupons, and authoritative pricing migration", () => {
  it("creates typed promotion rules and all relational targets", () => {
    expect(migration).toContain("create type public.promotion_discount_kind");
    for (const table of [
      "promotions", "promotion_products", "promotion_categories", "promotion_bundles",
      "coupon_products", "coupon_categories", "coupon_bundles",
    ]) expect(migration).toContain(`create table public.${table}`);
  });

  it("extends coupons with every requested operational rule", () => {
    for (const field of ["free_shipping", "per_customer_limit", "first_purchase_only", "disabled_at", "maximum_discount_cents"]) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain("lower(code)");
  });

  it("calculates integer-cent pricing from authoritative database rows", () => {
    expect(migration).toContain("function public.calculate_cart_pricing");
    expect(migration).toMatch(/(?:from|join) public\.products(?:\s+as)?/);
    expect(migration).toMatch(/from public\.shipping_methods(?:\s+as)?/);
    expect(migration).toContain("price_cents");
    expect(migration).not.toMatch(/p_(subtotal|total|discount|unit_price)_cents/);
  });

  it("uses stable errors, locked search paths, least privilege, RLS, and audit", () => {
    expect(migration).toContain("GD_PRICING_INVALID_LINES");
    expect(migration).toContain("GD_PRICING_PRODUCT_UNAVAILABLE");
    expect(migration).toContain("GD_PRICING_COUPON_INVALID");
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("private.audit_admin_mutation()");
    expect(migration).toContain("grant execute on function public.calculate_cart_pricing");
  });
});
