import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCounted, parseThreshold, stockCountNote, stockCountPlan, type StockCountRow } from "@/lib/admin/stock-count";

const row = (overrides: Partial<StockCountRow> = {}): StockCountRow => ({
  productId: 1,
  name: "Soar Phoenix 9-60GF",
  sku: "GD-SOAR",
  stock: 180,
  onOrders: 2,
  lowStockThreshold: 5,
  manageStock: true,
  active: true,
  ...overrides,
});

describe("stockCountPlan", () => {
  it("takes the pieces of unshipped orders off the count before comparing", () => {
    const plan = stockCountPlan([row()], new Map([[1, "186"]]));
    expect(plan.changes).toEqual([{ productId: 1, sku: "GD-SOAR", name: "Soar Phoenix 9-60GF", counted: 186, newStock: 184, delta: 4 }]);
  });

  it("skips what was not counted, and counts the ones already right", () => {
    const plan = stockCountPlan([row(), row({ productId: 2, sku: "GD-ENLIL", stock: 144, onOrders: 0 })], new Map([[2, "144"]]));
    expect(plan.changes).toEqual([]);
    expect(plan.matching).toBe(1);
  });

  it("refuses a count below the pieces already sold, a product without stock, and a non-number", () => {
    const plan = stockCountPlan(
      [row({ onOrders: 3 }), row({ productId: 2, manageStock: false }), row({ productId: 3 })],
      new Map([
        [1, "2"],
        [2, "10"],
        [3, "4,5"],
      ]),
    );
    expect(plan.changes).toEqual([]);
    expect(plan.problems.map((problem) => problem.productId)).toEqual([1, 2, 3]);
    expect(plan.problems[0]!.message).toBe("Contati 2, ma 3 sono già di ordini da spedire: ricontrolla.");
  });

  it("can bring a product to zero", () => {
    expect(stockCountPlan([row({ stock: 7, onOrders: 0 })], new Map([[1, "0"]])).changes[0]).toMatchObject({ newStock: 0, delta: -7 });
  });
});

describe("count inputs", () => {
  it("reads whole numbers only; blank means not counted", () => {
    expect(parseCounted("")).toBeNull();
    expect(parseCounted(" 12 ")).toBe(12);
    expect(parseCounted("-1")).toBe("invalid");
    expect(parseCounted("1e3")).toBe("invalid");
    expect(parseThreshold("3")).toBe(3);
    expect(parseThreshold("")).toBeNull();
    expect(parseThreshold("-2")).toBeNull();
  });

  it("names the day of the count in Rome time", () => {
    expect(stockCountNote(new Date("2026-11-17T23:30:00Z"))).toBe("Conteggio fisico del 18/11/2026");
  });
});

describe("applyStockCountAction", () => {
  const rpc = vi.fn(async () => ({ data: 0, error: null as null | { message: string } }));
  const update = vi.fn();

  beforeEach(() => {
    rpc.mockClear();
    update.mockClear();
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
    const geardrop = { id: 1, slug: "geardrop", name: "Gear Drop", storefrontPublic: true, role: "owner" as const };
    vi.doMock("@/lib/auth/guards", () => ({
      requireUser: vi.fn(async () => ({ id: "owner" })),
      requireStaffRole: vi.fn(async () => ({ userId: "owner", role: "owner", active: true, organization: geardrop, organizations: [geardrop] })),
    }));
    const chain = { update: (values: unknown) => (update(values), chain), eq: () => chain, then: (resolve: (value: unknown) => void) => resolve({ error: null }) };
    vi.doMock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc, from: () => chain }) }));
    // The stock now: one sold piece of Soar Phoenix is still on the shelf.
    vi.doMock("@/lib/admin/stock-count-repository", () => ({ loadStockCountRows: async () => [row({ stock: 180, onOrders: 1 })] }));
  });

  it("applies the difference against the stock of now, with the day as note, and saves a changed threshold", async () => {
    const { applyStockCountAction } = await import("@/app/admin/actions/stock-count");
    const form = new FormData();
    form.set("count-1", "186");
    form.set("min-1", "10");
    const state = await applyStockCountAction({ ok: false, message: "", applied: [], problems: [] }, form);

    expect(rpc).toHaveBeenCalledWith("adjust_inventory", {
      p_organization_id: 1,
      p_sku: "GD-SOAR",
      p_delta: 5,
      p_reason: "manual_adjustment",
      p_note: expect.stringMatching(/^Conteggio fisico del \d{2}\/\d{2}\/\d{4}$/),
    });
    expect(update).toHaveBeenCalledWith({ low_stock_threshold: 10 });
    expect(state).toMatchObject({ ok: true, message: "1 giacenza aggiornata, 0 già giuste, 1 scorta minima cambiata." });
  });
});
