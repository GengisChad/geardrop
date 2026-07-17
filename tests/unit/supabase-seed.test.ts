import { describe, expect, it } from "vitest";
import { generateSupabaseSeed } from "../../scripts/generate-supabase-seed";

describe("Supabase catalogue seed", () => {
  const sql = generateSupabaseSeed().toLowerCase();

  it("is idempotent and inserts every product with zero real stock", () => {
    expect(sql).toContain("on conflict (slug) do update");
    expect(sql).toContain("0 as stock_quantity");
    expect(sql).not.toContain("stock_quantity = excluded.stock_quantity");
  });

  it("never overwrites order intake or availability overrides", () => {
    expect(sql).toContain("on conflict (singleton) do nothing");
    expect(sql).not.toContain("accept_orders = excluded.accept_orders");
    expect(sql).not.toContain("availability_override = excluded.availability_override");
    expect(sql).not.toContain("preorder_allocation = excluded.preorder_allocation");
  });
});
