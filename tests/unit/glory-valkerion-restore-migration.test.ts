import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260916120000_restore_glory_valkerion_name.sql"),
  "utf8",
).replaceAll("\r\n", "\n");

describe("Glory Valkerion name restore", () => {
  it("restores the published product row in place to match the catalogue", () => {
    const product = PRODUCTS.find((item) => item.slug === "glory-valkerion-lf");

    expect(product?.name).toBe("Glory Valkerion LF");
    expect(migration).toContain("where slug = 'glory-valkyrie-lf'");
    expect(migration).toContain("set slug = 'glory-valkerion-lf'");
    expect(migration).toContain("name = 'Glory Valkerion LF'");
    expect(migration).toContain("'/products/glory-valkerion-lf.webp'");
    expect(migration).toContain(`description = '${product?.description.replaceAll("'", "''")}'`);
  });

  it("only updates existing rows inside one transaction", () => {
    expect(migration.startsWith("begin;\n")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(/\b(delete|insert|truncate)\b/i);
  });

  it("leaves no trace of the wrong name in the catalogue", () => {
    expect(JSON.stringify(PRODUCTS)).not.toMatch(/valkyrie/i);
  });
});
