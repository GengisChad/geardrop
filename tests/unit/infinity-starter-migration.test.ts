import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";

function readMigration(name: string): string {
  return readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8").replaceAll("\r\n", "\n").toLowerCase();
}

const migration = readMigration("20260915120000_publish_infinity_starter_preorders.sql");
// Glory was renamed to "Valkyrie" and later restored, so the published slugs match the catalogue again.
const publishedCatalogue = readMigration("20260904143000_publish_preorder_catalog.sql") + migration;

const added = new Map([
  ["glory-valkerion-lf", 8],
  ["hurricane-enlil-is-7-55t", 10],
  ["shatter-horus-9-65gb", 8],
]);

describe("infinity starter preorder migration", () => {
  it("publishes the three owner-supplied allocations in one locked transaction", () => {
    expect(migration.startsWith("begin;\n")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("pg_advisory_xact_lock");

    for (const [slug, allocation] of added) {
      expect(migration).toMatch(new RegExp(`\\('${slug}', ${allocation}, 'beyblade-x', `));
    }
  });

  /** Prices the owner changed later (2026-09-22); the migration keeps the price of its own day. */
  const PRICE_THEN: Readonly<Record<string, number>> = {
    "shatter-horus-9-65gb": 2000,
    "hurricane-enlil-is-7-55t": 2000,
  };

  it("keeps every product it published at the price and allocation of its day", () => {
    // Products added after this campaign (the 2026-09-21 drop) come with their own migration.
    const published = PRODUCTS.filter((product) => publishedCatalogue.includes(`('${product.slug}',`));
    expect(published).toHaveLength(9);
    for (const product of published) {
      // The quantity in that migration is the allocation of the day, and so is the price.
      const price = PRICE_THEN[product.slug] ?? product.price.amount;
      expect(publishedCatalogue, product.slug).toMatch(
        new RegExp(`\\('${product.slug}', \\d+, '${product.category}', [^\\n]*, ${price}, `),
      );
    }
  });

  it("guards allocation and review aggregates with its own campaign marker", () => {
    expect(migration).toContain("'2026-09-15-infinity-starter-preorders'");
    expect(migration).toContain("gd_preorder_catalog_unexpected_balance");
    expect(migration).toMatch(/preorder_allocation\s*=\s*case[\s\S]+?preorder_catalog_campaigns/);
    expect(migration).not.toMatch(/preorder_allocation\s*=\s*excluded\.preorder_allocation\s*[,;]/);
    expect(migration).toMatch(/rating\s*=\s*case[\s\S]+?then\s+public\.products\.rating/);
    expect(migration).toMatch(/review_count\s*=\s*case[\s\S]+?then\s+public\.products\.review_count/);
    expect(migration).toMatch(/insert into private\.preorder_catalog_campaigns[\s\S]+?on conflict \(campaign_key\) do nothing/);
  });

  it("only adds products: no archiving, order opening, CMS rewrite or destructive delete", () => {
    expect(migration).not.toContain("'archived'");
    expect(migration).not.toMatch(/accept_orders\s*=/);
    expect(migration).not.toMatch(/delete\s+from\s+public\.(products|orders|product_images|media_assets|inventory_movements)\b/);
    expect(migration).not.toMatch(/\btruncate\b/);
    expect(migration).not.toContain("homepage_section");
    expect(migration).not.toContain("bundle");
  });

  it("scopes every detail replacement to the three new products", () => {
    const deletes = [...migration.matchAll(/delete from public\.\w+\s+where product_id in \(([^;]+);/g)];

    expect(deletes).toHaveLength(4);
    for (const [, scope] of deletes) expect(scope).toContain("infinity_starter_seed");
  });
});
