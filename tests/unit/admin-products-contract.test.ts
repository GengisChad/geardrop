import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("product admin server boundary", () => {
  it("uses the exact action module with request-scoped auth and no direct stock update", () => {
    const source = readFileSync(join(root, "src/app/admin/actions/products.ts"), "utf8");
    expect(source).toContain("createSupabaseServerClient");
    expect(source).toContain("requireStaffRole");
    expect(source).not.toContain("getSession(");
    expect(source).not.toMatch(/stock_quantity\s*:/);
    expect(source).not.toContain("service_role");
    expect(source).toContain("revalidatePath");
    expect(source).toContain("revalidateTag");
    expect(source).toContain('.rpc("duplicate_product_draft"');
    expect(source).toContain('.rpc("bulk_update_products"');
    expect(source).toContain('.rpc("set_primary_product_image"');
    expect(source).toContain('.rpc("delete_product_permanently"');
    expect(source).not.toContain('.from("products").delete()');
    expect(source).not.toContain("Date.now()");
  });

  it("keeps product list filtering, exact count, and pagination in PostgreSQL", () => {
    const source = readFileSync(join(root, "src/lib/admin/product-repository.ts"), "utf8");
    expect(source).toContain('{ count: "exact" }');
    expect(source).toContain(".range(from, to)");
    expect(source).toContain('.eq("is_low_stock", true)');
    expect(source).not.toContain("sortProducts(");
    expect(source).not.toContain(".filter((product)");
  });

  it("enforces editor commerce boundaries inside PostgreSQL", () => {
    const migration = readFileSync(join(root, "supabase/migrations/20260718010000_enforce_product_editor_boundaries.sql"), "utf8");
    expect(migration).toContain("products_enforce_editor_boundaries");
    expect(migration).toContain("GD_EDITOR_COMMERCE_FIELDS_FORBIDDEN");
    expect(migration).toContain("GD_EDITOR_DRAFT_DEFAULTS_REQUIRED");
    expect(migration).toContain("GD_ZERO_PRICE_PRODUCT_CANNOT_PUBLISH");
    expect(migration).toContain("new.stock_quantity is distinct from old.stock_quantity");
  });

  it("keeps Supabase out of product client components", () => {
    for (const file of ["product-list-client.tsx", "product-editor-form.tsx"]) {
      const source = readFileSync(join(root, "src/components/admin/products", file), "utf8");
      expect(source).not.toContain("@supabase/");
      expect(source).not.toContain("createSupabase");
      expect(source).not.toContain(".from(");
    }
  });

});
