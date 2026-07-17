import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");

function migration(name: string): string {
  const filename = readdirSync(migrationsDirectory).find((candidate) => candidate.endsWith(`_${name}.sql`));

  if (!filename) {
    throw new Error(`Migration not found: ${name}`);
  }

  return readFileSync(join(migrationsDirectory, filename), "utf8").toLowerCase();
}

describe("Supabase commerce migrations", () => {
  it("removes only the inventoried legacy application objects", () => {
    const sql = migration("reset_legacy_public_schema");

    expect(sql).toContain("drop trigger if exists on_auth_user_created on auth.users");
    expect(sql).toContain("drop table if exists public.tournaments");
    expect(sql).not.toContain("drop schema public");
    expect(sql).not.toContain("drop table auth.users");
  });

  it("separates customer and staff identities and defaults commerce to disabled", () => {
    const sql = migration("create_commerce_foundation");

    expect(sql).toContain("create table public.customer_profiles");
    expect(sql).toContain("create table public.staff_profiles");
    expect(sql).toMatch(/accept_orders\s+boolean\s+not null\s+default false/);
    expect(sql).toMatch(/stock_quantity\s+integer\s+not null\s+default 0/);
    expect(sql).toContain("create type public.staff_role");
    expect(sql).toContain("create type public.availability_override");
  });

  it("enables RLS for every exposed commerce table", () => {
    const sql = migration("secure_commerce_foundation");
    const exposedTables = [
      "site_settings",
      "categories",
      "products",
      "product_images",
      "product_specs",
      "product_features",
      "product_box_contents",
      "product_tags",
      "product_relations",
      "bundles",
      "bundle_items",
      "shipping_methods",
      "coupons",
      "customer_profiles",
      "customer_addresses",
      "staff_profiles",
      "orders",
      "order_items",
      "coupon_redemptions",
      "inventory_movements",
      "audit_events",
      "order_enablement_checks",
    ];

    for (const table of exposedTables) {
      expect(sql, `RLS missing for ${table}`).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("routes stock changes through a locked transaction and movement ledger", () => {
    const sql = migration("add_inventory_functions");

    expect(sql).toContain("create or replace function public.adjust_inventory");
    expect(sql).toContain("for update");
    expect(sql).toContain("insert into public.inventory_movements");
    expect(sql).toContain("revoke update (stock_quantity) on public.products");
  });

  it("provides a guarded one-shot bootstrap for exactly two initial owners", () => {
    const sql = migration("add_initial_owner_bootstrap");

    expect(sql).toContain("create or replace function private.bootstrap_initial_owners");
    expect(sql).toContain("cardinality(p_emails) <> 2");
    expect(sql).toContain("from auth.users");
    expect(sql).toContain("gd_owner_bootstrap_already_used");
    expect(sql).toContain("revoke all on function private.bootstrap_initial_owners");
  });
});
