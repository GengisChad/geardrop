import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");

function migration(name: string): string {
  const filename = readdirSync(migrationsDirectory).find((candidate) =>
    candidate.endsWith(`_${name}.sql`),
  );
  if (!filename) throw new Error(`Migration not found: ${name}`);
  return readFileSync(join(migrationsDirectory, filename), "utf8");
}

const sql = migration("allow_authenticated_order_intake");
/** The function body alone, so the rationale in the header comment is not asserted on. */
const body = sql.slice(sql.indexOf("as $$"));

describe("authenticated order intake migration", () => {
  it("stops the product trigger from refusing every non-staff write", () => {
    // Reserving stock during checkout runs under the buyer's auth.uid(). Refusing it
    // meant a signed-in customer could never place an order at all.
    expect(body).not.toContain("GD_PRODUCT_STAFF_REQUIRED");
    expect(sql).toMatch(
      /if not private\.has_staff_role\(array\['editor'::public\.staff_role\]\) then\s*\n\s*return new;/,
    );
  });

  it("keeps every editor restriction exactly as strict", () => {
    for (const guard of [
      "GD_EDITOR_DRAFT_DEFAULTS_REQUIRED",
      "GD_EDITOR_COMMERCE_FIELDS_FORBIDDEN",
      "GD_ZERO_PRICE_PRODUCT_CANNOT_PUBLISH",
      "GD_EDITOR_PUBLICATION_STATE_INVALID",
    ]) {
      expect(sql).toContain(guard);
    }
    for (const field of [
      "price_cents",
      "stock_quantity",
      "preorder_allocation",
      "availability_override",
      "low_stock_threshold",
      "allow_backorder",
    ]) {
      expect(sql).toContain(`new.${field} is distinct from old.${field}`);
    }
  });

  it("does not introduce a flag an editor could set to escape those restrictions", () => {
    // A transaction-local GUC would have been forgeable: any editor can call set_config.
    expect(sql).not.toContain("set_config");
    expect(sql).not.toContain("current_setting");
  });

  it("leaves the trigger unprivileged and search-path pinned", () => {
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("revoke all on function private.enforce_product_editor_boundaries()");
  });

  it("stays forward-only", () => {
    for (const forbidden of [/\bdrop\s+table\b/i, /\btruncate\b/i, /\bdrop\s+trigger\b/i]) {
      expect(sql).not.toMatch(forbidden);
    }
    // `create or replace` keeps the existing trigger pointing at the new body.
    expect(sql).toContain("create or replace function private.enforce_product_editor_boundaries()");
  });
});
