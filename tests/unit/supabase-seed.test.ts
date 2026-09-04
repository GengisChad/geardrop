import { describe, expect, it } from "vitest";
import { generateSupabaseSeed } from "../../scripts/generate-supabase-seed";

describe("Supabase catalogue seed", () => {
  const sql = generateSupabaseSeed().toLowerCase();

  it("is idempotent and inserts every product with zero real stock", () => {
    expect(sql).toContain("on conflict (slug) do update");
    expect(sql).toContain("0 as stock_quantity");
    expect(sql).not.toContain("stock_quantity = excluded.stock_quantity");
  });

  it("bootstraps uppercase SKUs and the reviewed preorder allocations", () => {
    for (const [sku, allocation] of [
      ["COBALT-DRAGOON-2-60C", 10],
      ["SOAR-PHOENIX-9-60GF", 60],
      ["SABER-SAMURAI-2-70L", 30],
      ["BLAST-PEGASUS-A-TR", 30],
      ["DROP-ATTACK-BATTLE-SET", 30],
      ["SNEAK-ATTACK-BATTLE-SET", 30],
    ] as const) {
      expect(sql).toContain(`'${sku.toLowerCase()}'`);
      expect(generateSupabaseSeed()).toContain(`'${sku}'`);
      expect(generateSupabaseSeed()).toMatch(
        new RegExp(`'${sku}'.{0,120}\\b${allocation}\\b`, "s"),
      );
    }
    expect(sql).toContain("'preorder'::public.availability_override");
  });

  it("never overwrites order intake or availability overrides", () => {
    expect(sql).toContain("on conflict (singleton) do nothing");
    expect(sql).not.toContain("accept_orders = excluded.accept_orders");
    expect(sql).not.toContain("availability_override = excluded.availability_override");
    expect(sql).not.toContain("preorder_allocation = excluded.preorder_allocation");
  });

  it("never links homepage sections to archived mock products", () => {
    for (const slug of [
      "stadio-beystadium-x-attack-set",
      "wizard-arrow-4-80b",
      "phoenix-wing-9-60gf",
      "shark-edge-3-60lf",
      "dran-sword-4-80db",
      "dran-buster-1-60a",
    ]) {
      expect(sql).not.toContain(`'${slug}'`);
    }
  });

  it("omits empty tag inserts instead of emitting invalid SQL", () => {
    expect(sql).not.toMatch(/with seed\(product_slug, tag\)[\s\S]+?values\s*\)/);
  });

  it("casts nullable numeric seed columns for PostgreSQL CTE inference", () => {
    expect(sql).toContain("seed.compare_at_price_cents::integer");
  });

  it("marks the first bootstrap image as primary without overwriting an operated cover", () => {
    const imageInsert = sql.match(/insert into public\.product_images\s*\(([^)]+)\)\s*select ([\s\S]+?)\nfrom seed/);
    expect(imageInsert).not.toBeNull();
    const columns = imageInsert![1]!.split(",").map((column) => column.trim());
    const values = imageInsert![2]!.split(",").map((value) => value.trim());
    expect(values[columns.indexOf("is_primary")]).toBe("seed.sort_order = 0");
    const conflict = sql.match(/on conflict \(product_id, sort_order\) do update set([\s\S]+?);/)![1];
    expect(conflict).not.toContain("is_primary =");
  });
});
