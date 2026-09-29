import { describe, expect, it } from "vitest";
import {
  COUNTED_TABLES,
  countDifferences,
  localMigrationVersions,
  pendingMigrations,
  safeHost,
} from "../../scripts/rehearse-production-upgrade";

describe("rehearsal helpers", () => {
  it("never leaks the password of a connection string", () => {
    expect(safeHost("postgresql://postgres:sup3r-s3cret@db.abcdef.supabase.co:5432/postgres")).toBe("db.abcdef.supabase.co:5432");
    expect(safeHost("non una url")).toBe("indirizzo non leggibile");
  });

  it("lists the migrations production is missing, in order", () => {
    const local = localMigrationVersions([
      "20260923100000_add_organizations.sql",
      "20260717185534_assert_dedicated_project.sql",
      "note.md",
      "20260928100000_add_inventory_costs.sql",
    ]);
    expect(local).toEqual(["20260717185534", "20260923100000", "20260928100000"]);
    expect(pendingMigrations(["20260717185534"], local)).toEqual(["20260923100000", "20260928100000"]);
    expect(pendingMigrations(local, local)).toEqual([]);
  });

  it("reports any table whose row count changed", () => {
    expect(countDifferences({ orders: 12, products: 21 }, { orders: 12, products: 21 })).toEqual([]);
    expect(countDifferences({ orders: 12 }, { orders: 11 })).toEqual(["orders: 12 → 11"]);
    expect(countDifferences({ orders: 12 }, { orders: 12, products: 3 })).toEqual(["products: 0 → 3"]);
  });

  it("counts the tables that carry the shop's history", () => {
    for (const table of ["orders", "order_items", "inventory_movements", "customer_profiles", "audit_events"]) {
      expect(COUNTED_TABLES).toContain(table);
    }
  });
});
