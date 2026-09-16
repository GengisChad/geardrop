import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260916100000_convert_catalogue_to_stock.sql"),
  "utf8",
).replaceAll("\r\n", "\n");

describe("catalogue stock conversion migration", () => {
  it("converts exactly the catalogue products, which the storefront sells as available", () => {
    const slugList = migration.match(/insert into catalogue_stock_slugs \(slug\) values([\s\S]+?);/)?.[1] ?? "";
    const slugs = [...slugList.matchAll(/'([^']+)'/g)].map((match) => match[1]);

    expect([...slugs].sort()).toEqual(PRODUCTS.map((product) => product.slug).sort());
    expect(PRODUCTS.every((product) => product.stock === "disponibile")).toBe(true);
  });

  it("only moves unsold pre-order allocations into stock and records the movement", () => {
    expect(migration).toContain("where product.availability_override = 'preorder'::public.availability_override");
    expect(migration).toContain("and product.preorder_allocation > 0");
    expect(migration).toContain("set availability_override = null,");
    expect(migration).toContain("preorder_allocation = 0,");
    expect(migration).toContain("product.stock_quantity + product.preorder_allocation as stock_after");
    expect(migration).toMatch(/insert into public\.inventory_movements[\s\S]+'initial'::public\.inventory_reason/);
  });

  it("runs in one locked transaction and never deletes or truncates", () => {
    expect(migration.startsWith("begin;\n")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).not.toMatch(/\b(delete|truncate|drop table)\b/i);
  });
});
