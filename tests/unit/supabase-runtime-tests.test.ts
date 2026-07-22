import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function pgTap(name: string): string {
  return readFileSync(join(process.cwd(), "supabase", "tests", name), "utf8").toLowerCase();
}

describe("Supabase runtime test coverage", () => {
  it("covers exact schema, migration, policy, and double-seed counts", () => {
    const sql = pgTap("002_commerce_schema.test.sql");

    for (const expected of ["schema_migrations", "32::bigint", "14::bigint", "89::bigint", "8::bigint", "9::bigint"]) {
      expect(sql).toContain(expected);
    }
  });

  it("covers anonymous, customer, editor, admin, and owner RLS", () => {
    const sql = pgTap("004_rls_roles.test.sql");

    for (const expected of ["set local role anon", "set local role authenticated", "customer-one", "editor", "admin", "owner"]) {
      expect(sql).toContain(expected);
    }
    expect(sql).toContain("draft-hidden");
    expect(sql).toContain("no-image-hidden");
  });

  it("covers inventory ledger and negative stock", () => {
    const sql = pgTap("005_inventory_and_bootstrap.test.sql");

    for (const expected of [
      "adjust_inventory",
      "inventory_movements",
      "gd_insufficient_stock",
      "auth users receive no automatic owner privilege",
    ]) {
      expect(sql).toContain(expected);
    }
  });

  it("covers the retired owner bootstrap", () => {
    const sql = pgTap("024_owner_bootstrap_retired.test.sql");

    for (const expected of [
      "hasnt_function",
      "bootstrap_initial_owners",
      "routine_privileges",
      "record_staff_invite",
      "change_staff_role",
    ]) {
      expect(sql).toContain(expected);
    }
  });

  // The function is dropped by 20260721010000_retire_owner_bootstrap, so a test that still
  // calls it aborts its whole file under pgTAP — which is exactly how 005 broke CI while
  // every offline gate stayed green.
  it("leaves no pgTAP test calling the dropped bootstrap function", () => {
    const dir = join(process.cwd(), "supabase", "tests");

    for (const name of readdirSync(dir).filter((file) => file.endsWith(".test.sql"))) {
      const sql = readFileSync(join(dir, name), "utf8").toLowerCase();

      expect(sql, name).not.toMatch(/(select|perform)\s+private\.bootstrap_initial_owners/);
    }
  });
});
