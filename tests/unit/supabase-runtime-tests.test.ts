import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function pgTap(name: string): string {
  return readFileSync(join(process.cwd(), "supabase", "tests", name), "utf8").toLowerCase();
}

describe("Supabase runtime test coverage", () => {
  it("covers exact schema, migration, policy, and double-seed counts", () => {
    const sql = pgTap("002_commerce_schema.test.sql");

    for (const expected of ["schema_migrations", "22::bigint", "12::bigint", "52::bigint", "8::bigint", "9::bigint"]) {
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

  it("covers inventory ledger, negative stock, and one-shot owner bootstrap", () => {
    const sql = pgTap("005_inventory_and_bootstrap.test.sql");

    for (const expected of [
      "adjust_inventory",
      "inventory_movements",
      "gd_insufficient_stock",
      "bootstrap_initial_owners",
      "gd_owner_bootstrap_requires_two_emails",
      "gd_owner_bootstrap_users_not_ready",
      "gd_owner_bootstrap_already_used",
    ]) {
      expect(sql).toContain(expected);
    }
  });
});
