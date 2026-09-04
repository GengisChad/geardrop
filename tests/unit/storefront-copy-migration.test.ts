import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260904150000_align_storefront_copy.sql",
);

describe("truthful storefront copy migration", () => {
  it("exists as the guarded forward migration", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("updates only known defaults, hides seeded Club/bundle, and preserves reviewed legal text", () => {
    if (!existsSync(migrationPath)) {
      expect(existsSync(migrationPath)).toBe(true);
      return;
    }
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).toContain("where section_key = 'hero'");
    expect(sql).toContain("prodotti originali, drop esclusivi");
    expect(sql).toContain("## i prodotti sono originali?");
    expect(sql).toContain("section_key in ('champion-bundle', 'club')");
    expect(sql).toContain("testo segnaposto");
    expect(sql).toContain("publication_status = 'draft'");
    expect(sql).not.toMatch(/update public\.content_pages[\s\S]+where slug in \('termini', 'privacy'\)\s*;/);
    expect(sql).not.toContain("accept_orders = true");
  });
});
