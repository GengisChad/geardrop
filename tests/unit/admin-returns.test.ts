import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseReturnForm, returnableLines, returnFailure } from "@/lib/admin/returns";

const item = (productId: number | null, quantity: number, name = "Soar Phoenix") => ({
  product_id: productId,
  product_name_snapshot: name,
  sku_snapshot: `GD-${productId}`,
  quantity,
});

describe("returnableLines", () => {
  it("adds up each product of the order and what came back already", () => {
    const lines = returnableLines(
      [item(1, 2), item(1, 1), item(2, 1, "String Launcher"), item(null, 1, "Prodotto rimosso")],
      [
        { action: "order.return_recorded", after_state: { product_id: 1, quantity: 1, restocked: true } },
        { action: "order.return_recorded", after_state: { product_id: 1, quantity: 1, restocked: false } },
        { action: "order.shipped", after_state: { product_id: 2, quantity: 9 } },
      ],
    );
    expect(lines).toEqual([
      { productId: 1, name: "Soar Phoenix", sku: "GD-1", sold: 3, returned: 2 },
      { productId: 2, name: "String Launcher", sku: "GD-2", sold: 1, returned: 0 },
    ]);
  });
});

describe("parseReturnForm", () => {
  it("reads quantities and condition, skipping blanks and zeros", () => {
    const form = new FormData();
    form.set("qty-1", "2");
    form.set("condition-1", "vendibile");
    form.set("qty-2", "1");
    form.set("condition-2", "danneggiato");
    form.set("qty-3", "");
    form.set("qty-4", "0");
    expect(parseReturnForm(form.entries())).toEqual([
      { product_id: 1, quantity: 2, restock: true },
      { product_id: 2, quantity: 1, restock: false },
    ]);
  });

  it("refuses a quantity that is not a whole number", () => {
    const form = new FormData();
    form.set("qty-1", "1.5");
    expect(parseReturnForm(form.entries())).toBe("invalid");
  });

  it("says why the database refused", () => {
    expect(returnFailure("GD_RETURN_TOO_MANY")).toContain("Più pezzi");
    expect(returnFailure("GD_RETURN_NOT_SHIPPED")).toContain("spediti");
    expect(returnFailure("boom")).toBe("Reso non registrato. Riprova.");
  });
});

describe("recordOrderReturnAction", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    rpc.mockReset();
    vi.resetModules();
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
    const geardrop = { id: 1, slug: "geardrop", name: "Gear Drop", storefrontPublic: true, role: "owner" as const };
    vi.doMock("@/lib/auth/guards", () => ({
      requireUser: vi.fn(async () => ({ id: "owner" })),
      requireStaffRole: vi.fn(async () => ({ userId: "owner", role: "owner", active: true, organization: geardrop, organizations: [geardrop] })),
    }));
    vi.doMock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
  });

  it("sends the lines to record_order_return and reports what went back on sale", async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    const { recordOrderReturnAction } = await import("@/app/admin/actions/returns");
    const form = new FormData();
    form.set("orderId", "7");
    form.set("qty-1", "1");
    form.set("condition-1", "vendibile");
    form.set("qty-2", "1");
    form.set("condition-2", "danneggiato");
    form.set("note", " scatola aperta ");
    const state = await recordOrderReturnAction({ ok: false, message: "" }, form);
    expect(rpc).toHaveBeenCalledWith("record_order_return", {
      p_order_id: 7,
      p_lines: [
        { product_id: 1, quantity: 1, restock: true },
        { product_id: 2, quantity: 1, restock: false },
      ],
      p_note: "scatola aperta",
    });
    expect(state).toEqual({ ok: true, message: 'Reso registrato: 2 pezzi, 1 rimesso in vendita. Il rimborso, se serve, si fa da "Rimborsa".' });
  });

  it("turns a refusal into words and never calls the database for an empty return", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "GD_RETURN_TOO_MANY" } });
    const { recordOrderReturnAction } = await import("@/app/admin/actions/returns");
    const empty = new FormData();
    empty.set("orderId", "7");
    expect((await recordOrderReturnAction({ ok: false, message: "" }, empty)).message).toBe("Scrivi quanti pezzi sono tornati.");
    expect(rpc).not.toHaveBeenCalled();

    const form = new FormData();
    form.set("orderId", "7");
    form.set("qty-1", "5");
    expect((await recordOrderReturnAction({ ok: false, message: "" }, form)).message).toContain("Più pezzi");
  });
});
