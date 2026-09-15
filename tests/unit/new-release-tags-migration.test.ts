import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import { newReleases } from "@/lib/home/product-selection";

/** Slugs renamed by later forward migrations: the tag migration still names the original one. */
const RENAMED: Readonly<Record<string, string>> = { "glory-valkerion-lf": "glory-valkyrie-lf" };

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260915180000_tag_infinity_starters_as_new.sql"),
  "utf8",
)
  .replaceAll("\r\n", "\n")
  .toLowerCase();

describe("new release tags", () => {
  it("tags exactly the catalogue's new releases in the database migration", () => {
    const tagged = newReleases(PRODUCTS).map((product) => product.slug);

    expect(tagged).toEqual(["glory-valkyrie-lf", "hurricane-enlil-is-7-55t", "shatter-horus-9-65gb"]);
    const slugList = migration.match(/where product\.slug in \(([^)]+)\)/)?.[1] ?? "";
    expect([...slugList.matchAll(/'([^']+)'/g)].map((match) => RENAMED[match[1]!] ?? match[1]).sort()).toEqual([...tagged].sort());
    expect(migration).toContain("'novita'::public.promo_tag");
  });

  it("only adds tags inside one transaction", () => {
    expect(migration.startsWith("begin;\n")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("on conflict (product_id, tag) do nothing");
    expect(migration).not.toMatch(/\bdelete\b|\bupdate\b|\btruncate\b/);
  });
});
