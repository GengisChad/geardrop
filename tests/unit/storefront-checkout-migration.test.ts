import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");

function migration(name: string): string {
  const filename = readdirSync(migrationsDirectory).find((candidate) =>
    candidate.endsWith(`_${name}.sql`),
  );
  if (!filename) throw new Error(`Migration not found: ${name}`);
  return readFileSync(join(migrationsDirectory, filename), "utf8").toLowerCase();
}

const sql = migration("fix_storefront_checkout_boundaries");

describe("storefront checkout boundaries migration", () => {
  it("hands order intake to the roles that carry a request identity", () => {
    expect(sql).toMatch(
      /grant execute on function public\.create_order\([^)]*\)\s*\n?\s*to anon, authenticated;/,
    );
  });

  it("keeps service_role out of order creation", () => {
    const grants = sql.match(/grant execute on function public\.create_order\([^)]*\)\s*\n?\s*to ([^;]+);/);

    expect(grants).not.toBeNull();
    expect(grants?.[1]).not.toContain("service_role");
  });

  it("leaves the unvalidated implementation unreachable", () => {
    expect(sql).toMatch(
      /revoke all on function private\.create_order_unchecked\([^)]*\)\s*\n?\s*from public, anon, authenticated, service_role;/,
    );
  });

  it("never lets a caller name the customer", () => {
    // The whole point of B2: identity comes from auth.uid(), so the signature must not
    // grow a customer argument, and the body must not accept one.
    expect(sql).not.toContain("p_customer_id");
    expect(sql).not.toMatch(/customer_id\s*:?=/);
  });

  it("preserves the hardened execution context and the acceptance lock", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("for share");
    expect(sql).toContain("gd_order_intake_disabled");
  });

  it("keeps authoritative pricing in the private implementation", () => {
    expect(sql).toContain("private.create_order_unchecked");
    expect(sql).not.toMatch(/p_(subtotal|discount|shipping|total)_cents/);
  });

  it("maps malformed quantities to domain codes instead of constraint violations", () => {
    for (const code of [
      "gd_order_invalid_payload",
      "gd_order_invalid_quantity",
      "gd_order_quantity_limit",
    ]) {
      expect(sql).toContain(code);
    }
    // JSON numbers are arbitrary precision, so fractional quantities must be rejected
    // before anything casts them.
    expect(sql).toContain("trunc(");
  });

  it("lets a preorder allocation reach zero without dropping the scope rule", () => {
    expect(sql).toContain("preorder_allocation > 0");
    expect(sql).toContain("drop constraint");
    expect(sql).toContain("products_preorder_allocation_scope");
    expect(sql).toMatch(/or preorder_allocation = 0/);
  });

  it("finds the anonymous constraints by definition rather than by generated name", () => {
    expect(sql).toContain("pg_catalog.pg_get_constraintdef");
    expect(sql).toContain("gd_migration_preorder_constraints_not_found");
    expect(sql).not.toMatch(/drop constraint products_check\d*/);
  });

  it("stays forward-only", () => {
    for (const forbidden of [/\bdrop\s+table\b/, /\btruncate\b/, /\bdrop\s+schema\b/]) {
      expect(sql).not.toMatch(forbidden);
    }
  });
});
