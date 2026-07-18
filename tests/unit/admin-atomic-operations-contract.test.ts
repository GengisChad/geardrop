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

describe("atomic admin catalog operations", () => {
  it("exposes exact RPCs with fixed security boundaries and aggregate audit", () => {
    const sql = migration("add_atomic_admin_operations");
    const functions = [
      "duplicate_product_draft",
      "bulk_update_products",
      "replace_product_details",
      "reorder_product_images",
      "set_primary_product_image",
      "swap_media_asset_associations",
      "product_deletion_impact",
      "delete_product_permanently",
    ];

    for (const functionName of functions) {
      expect(sql).toContain(`create or replace function public.${functionName}`);
      expect(sql).toContain(`revoke all on function public.${functionName}`);
      expect(sql).toContain(`grant execute on function public.${functionName}`);
    }

    expect(sql.match(/security definer/g)?.length).toBeGreaterThanOrEqual(functions.length + 1);
    expect(sql.match(/set search_path = ''/g)?.length).toBeGreaterThanOrEqual(functions.length + 1);
    expect(sql).toContain("'inventory.adjusted'");
    expect(sql).toContain("'catalog.product.duplicated'");
    expect(sql).toContain("'catalog.product.deleted'");
    expect(sql).toContain("gd_product_has_orders");
    expect(sql).toContain("gd_product_has_bundles");
    expect(sql).toContain("gd_media_not_ready");
    expect(sql).not.toMatch(/grant update[\s\S]+stock_quantity/);
  });
});
