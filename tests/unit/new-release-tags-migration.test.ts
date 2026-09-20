import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import { newReleases } from "@/lib/home/product-selection";

/** Slugs renamed by later forward migrations (Glory went to "Valkyrie" and back, so none remain). */
const RENAMED: Readonly<Record<string, string>> = {};

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260915180000_tag_infinity_starters_as_new.sql"),
  "utf8",
)
  .replaceAll("\r\n", "\n")
  .toLowerCase();

const STARTERS = ["glory-valkerion-lf", "hurricane-enlil-is-7-55t", "shatter-horus-9-65gb"];

/** The drop that took over the homepage on 2026-09-21. */
const drop = readFileSync(
  join(process.cwd(), "supabase/migrations/20260921120000_preorder_drop_september.sql"),
  "utf8",
)
  .replaceAll("\r\n", "\n")
  .toLowerCase();

describe("new release tags", () => {
  it("tagged the Infinity Starters when they were the new releases", () => {
    const slugList = migration.match(/where product\.slug in \(([^)]+)\)/)?.[1] ?? "";
    expect([...slugList.matchAll(/'([^']+)'/g)].map((match) => RENAMED[match[1]!] ?? match[1]).sort()).toEqual([...STARTERS].sort());
    expect(migration).toContain("'novita'::public.promo_tag");
  });

  it("hands the tag to the newest drop, in the catalogue and in the database", () => {
    const tagged = newReleases(PRODUCTS).map((product) => product.slug);

    expect(tagged).toEqual([
      "cobalt-drake-4-60f",
      "mirage-clock-9-65b",
      "suppress-superion-0-70lp",
      "strike-dran-4-50ff",
      "tread-croc-tq-5-50gn",
    ]);
    for (const slug of tagged) expect(drop, slug).toContain(`('${slug}', 'novita')`);
    // The starters keep selling, they just stop leading the homepage.
    for (const slug of STARTERS) expect(drop).toContain(`'${slug}'`);
    expect(drop).toMatch(/delete from public\.product_tags[\s\S]+?'novita'::public\.promo_tag/);
  });

  it("only adds tags inside one transaction", () => {
    expect(migration.startsWith("begin;\n")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("on conflict (product_id, tag) do nothing");
    expect(migration).not.toMatch(/\bdelete\b|\bupdate\b|\btruncate\b/);
  });
});
