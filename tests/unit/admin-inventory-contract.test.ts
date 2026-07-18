import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("admin inventory boundary", () => {
  it("adjusts stock only through the manager RPC", () => {
    const source = readFileSync(join(root, "src/app/admin/actions/inventory.ts"), "utf8");
    expect(source).toContain('.rpc("adjust_inventory"');
    expect(source).toContain('verifiedStaff(client, ["owner", "admin"])');
    expect(source).not.toMatch(/\.from\("products"\)\.update/);
    expect(source).toContain("inventoryAdjustmentSchema.safeParse");
    expect(source.indexOf("inventoryAdjustmentSchema.safeParse")).toBeLessThan(source.indexOf("createSupabaseServerClient"));
  });

  it("renders authoritative generated fields and real movements", () => {
    const page = readFileSync(join(root, "src/app/admin/(protected)/inventario/page.tsx"), "utf8");
    const repository = readFileSync(join(root, "src/lib/admin/inventory-repository.ts"), "utf8");
    expect(page).toContain("listAdminInventory");
    expect(page).toContain("is_purchasable");
    expect(page).toContain("stock_status");
    expect(page).toContain("availability_override");
    expect(page).toContain("Nessun prodotto in inventario");
    expect(repository).toContain('{ count: "exact" }');
    expect(repository).toContain("inventory_movements");
    expect(repository).toContain('.eq("is_low_stock", true)');
  });
});
