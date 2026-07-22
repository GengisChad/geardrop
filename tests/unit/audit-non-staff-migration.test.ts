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

const sql = migration("audit_skips_non_staff_writes");
/** The function body alone, so the rationale in the header comment is not asserted on. */
const body = sql.slice(sql.indexOf("as $$"));

describe("audit trigger skips non-staff writes", () => {
  it("stops the audit trigger from refusing a customer's stock reservation", () => {
    expect(body).not.toContain("GD_STAFF_REQUIRED");
    expect(body).not.toContain("raise exception");
  });

  it("still audits every staff mutation, unchanged", () => {
    expect(body).toContain("insert into public.audit_events");
    for (const column of ["actor_user_id", "action", "entity_type", "entity_id", "before_state", "after_state"]) {
      expect(body).toContain(column);
    }
    expect(body).toContain("lower(tg_op)");
    expect(body).toContain("tg_table_name");
    // The composite key fallback for child tables without an id column.
    expect(body).toContain("related_product_id");
    expect(body).toContain("'unknown'");
  });

  it("returns the right row for every trigger operation", () => {
    // DELETE must return OLD or the row would not be removed.
    expect(body.match(/return old;/g)?.length).toBeGreaterThanOrEqual(3);
    expect(body.match(/return new;/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("stays a pinned, unprivileged security-definer trigger", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("revoke all on function private.audit_admin_mutation()");
  });

  it("stays forward-only and keeps the existing triggers attached", () => {
    expect(sql).toContain("create or replace function private.audit_admin_mutation()");
    for (const forbidden of [/\bdrop\s+trigger\b/i, /\bdrop\s+table\b/i, /\btruncate\b/i]) {
      expect(sql).not.toMatch(forbidden);
    }
  });
});
