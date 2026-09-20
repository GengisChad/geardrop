import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";

/** The conversion ran while Glory was briefly named "Valkyrie"; a later migration restored the slug. */
const RENAMED: Readonly<Record<string, string>> = { "glory-valkyrie-lf": "glory-valkerion-lf" };

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260916100000_convert_catalogue_to_stock.sql"),
  "utf8",
).replaceAll("\r\n", "\n");

/** The nine products this migration moved from pre-order allocations to stock. */
const CONVERTED = [
  "cobalt-dragoon-2-60c",
  "soar-phoenix-9-60gf",
  "saber-samurai-2-70l",
  "blast-pegasus-a-tr",
  "drop-attack-battle-set",
  "sneak-attack-battle-set",
  "glory-valkerion-lf",
  "hurricane-enlil-is-7-55t",
  "shatter-horus-9-65gb",
] as const;

describe("catalogue stock conversion migration", () => {
  it("converts the products it found, and the shop still sells each of them from stock", () => {
    const slugList = migration.match(/insert into catalogue_stock_slugs \(slug\) values([\s\S]+?);/)?.[1] ?? "";
    const slugs = [...slugList.matchAll(/'([^']+)'/g)].map((match) => RENAMED[match[1]!] ?? match[1]);
    const catalogue = new Map(PRODUCTS.map((product) => [product.slug as string, product]));

    // The catalogue has grown since (the 2026-09-21 pre-order drop), so this is the set it converted.
    expect([...slugs].sort()).toEqual([...CONVERTED].sort());
    for (const slug of slugs) {
      expect(catalogue.get(slug ?? "")?.stock, slug).toBe("disponibile");
    }
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
