import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260904143000_publish_preorder_catalog.sql",
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8").replaceAll("\r\n", "\n").toLowerCase()
  : "";

const allocations = new Map([
  ["cobalt-dragoon-2-60c", 10],
  ["soar-phoenix-9-60gf", 60],
  ["saber-samurai-2-70l", 30],
  ["blast-pegasus-a-tr", 30],
  ["drop-attack-battle-set", 30],
  ["sneak-attack-battle-set", 30],
]);

describe("preorder catalogue forward migration", () => {
  it("publishes all six reviewed allocations under one advisory lock", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain("pg_advisory_xact_lock");

    for (const [slug, allocation] of allocations) {
      expect(migration).toMatch(
        new RegExp(`'${slug}'.{0,120}\\b${allocation}\\b`, "s"),
      );
    }
  });

  it("archives only the six replaced mock products while preserving Cobalt and Sneak", () => {
    const archiveStatement = migration.match(
      /update public\.products[\s\S]+?set[\s\S]+?publication_status\s*=\s*'archived'[\s\S]+?where[\s\S]+?slug\s+in\s*\(([^)]+)\)/,
    )?.[1] ?? "";
    const archived = [...archiveStatement.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();

    expect(archived).toEqual([
      "dran-buster-1-60a",
      "dran-sword-4-80db",
      "phoenix-wing-9-60gf",
      "shark-edge-3-60lf",
      "stadio-beystadium-x-attack-set",
      "wizard-arrow-4-80b",
    ]);
    expect(archived).not.toContain("cobalt-dragoon-2-60c");
    expect(archived).not.toContain("sneak-attack-battle-set");
  });

  it("uses a persistent campaign marker and rejects an unexpected live balance", () => {
    expect(migration).toContain("preorder_catalog_campaigns");
    expect(migration).toContain("gd_preorder_catalog_unexpected_balance");
    expect(migration).toMatch(/preorder_allocation\s*=\s*case[\s\S]+?preorder_catalog_campaigns/);
    expect(migration).not.toMatch(/preorder_allocation\s*=\s*excluded\.preorder_allocation\s*[,;]/);
  });

  it("preserves post-launch review aggregates when the campaign has already run", () => {
    expect(migration).toMatch(
      /rating\s*=\s*case[\s\S]+?preorder_catalog_campaigns[\s\S]+?then\s+public\.products\.rating[\s\S]+?else\s+excluded\.rating[\s\S]+?end/,
    );
    expect(migration).toMatch(
      /review_count\s*=\s*case[\s\S]+?preorder_catalog_campaigns[\s\S]+?then\s+public\.products\.review_count[\s\S]+?else\s+excluded\.review_count[\s\S]+?end/,
    );
  });

  it("does not open orders or destroy product and order history", () => {
    expect(migration).not.toMatch(/accept_orders\s*=/);
    expect(migration).not.toMatch(/delete\s+from\s+public\.(products|orders|product_images|media_assets|inventory_movements)\b/);
    expect(migration).not.toMatch(/\btruncate\b/);
  });
});
