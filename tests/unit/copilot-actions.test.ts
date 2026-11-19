import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const transitionOrderAction = vi.fn(async (_state: unknown, _form: FormData) => ({ ok: true, message: "Stato aggiornato." }));
const shipOrderAction = vi.fn(async (_state: unknown, _form: FormData) => ({ ok: true, message: "Spedizione salvata e cliente avvisato." }));
const addOrderNoteAction = vi.fn(async (_state: unknown, _form: FormData) => ({ ok: true, message: "Nota aggiunta." }));
const adjustInventoryAction = vi.fn(async (_state: unknown, _form: FormData) => ({ ok: true, message: "Movimento registrato. Stock attuale: 182." }));
const setListPriceAction = vi.fn(async (_state: unknown, _form: FormData) => ({ ok: true, message: "Prezzo salvato: €17,90." }));
const setProductCostAction = vi.fn(async (_state: unknown, _form: FormData) => ({ ok: true, message: "Costo salvato." }));
vi.mock("@/app/admin/actions/orders", () => ({ transitionOrderAction, shipOrderAction, addOrderNoteAction }));
vi.mock("@/app/admin/actions/inventory", () => ({ adjustInventoryAction }));
vi.mock("@/app/admin/actions/products", () => ({ setListPriceAction }));
vi.mock("@/app/admin/actions/warehouse", () => ({ setProductCostAction }));

const { copilotActionTools, executeCopilotAction } = await import("@/lib/ai/copilot-actions");
type CopilotAction = Awaited<ReturnType<typeof executeCopilotAction>> extends unknown ? Parameters<typeof executeCopilotAction>[0] : never;

type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
const writes: string[] = [];

/** A read-only Supabase stand-in: every query answers from `rows`, and any write is recorded. */
function fakeClient() {
  return {
    rpc: (...args: unknown[]) => {
      writes.push(`rpc:${String(args[0])}`);
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      const result = () => ({ data: rows[table] ?? [], error: null });
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "or", "in", "is", "order", "gte"]) chain[method] = () => chain;
      for (const method of ["insert", "update", "upsert", "delete"]) {
        chain[method] = () => {
          writes.push(`${method}:${table}`);
          return chain;
        };
      }
      chain["limit"] = () => Promise.resolve(result());
      chain["maybeSingle"] = () => Promise.resolve({ data: (rows[table] ?? [])[0] ?? null, error: null });
      return chain;
    },
  } as never;
}

function prepare(name: string, input: Record<string, unknown>) {
  const cards: CopilotAction[] = [];
  const tool = copilotActionTools(fakeClient(), 1, (card) => cards.push(card)).find((candidate) => candidate.name === name)!;
  return tool.run(input).then((reply) => ({ reply: String(reply), card: cards[0]! }));
}

const PHOENIX = { id: 2, sku: "SOAR-PHOENIX-9-60GF", name: "Soar Phoenix 9-60GF", price_cents: 1990, compare_at_price_cents: null, stock_quantity: 184 };

beforeEach(() => {
  rows = {
    orders: [{ id: 19, order_number: "GD-ESZGLRU5", status: "processing", payment_status: "paid", shipped_at: null, tracking_code: null }],
    products: [PHOENIX],
    inventory_valuation: [{ average_cost_cents: 800 }],
  };
  writes.length = 0;
  vi.clearAllMocks();
});

describe("the assistant's action tools (owner, 2026-11-19)", () => {
  it("prepare a card and write nothing until it is confirmed", async () => {
    const { reply, card } = await prepare("cambia_stato_ordine", { ordine: "gd-eszglru5", stato: "evaso" });
    expect(card).toMatchObject({ kind: "stato_ordine", status: "pending", title: "Ordine GD-ESZGLRU5: in lavorazione → spedito", input: { orderId: 19, to: "shipped" } });
    expect(card.details).toContain("Nessuna email al cliente.");
    expect(reply).toContain("Non è ancora fatta");
    expect(writes).toEqual([]);
    expect(transitionOrderAction).not.toHaveBeenCalled();
  });

  it("refuse what the panel would refuse: an order already there, more pieces than the shelf holds, an ambiguous product", async () => {
    await expect(prepare("cambia_stato_ordine", { ordine: "GD-ESZGLRU5", stato: "in_lavorazione" })).rejects.toThrow("è già in lavorazione");
    await expect(prepare("movimento_magazzino", { prodotto: "phoenix", variazione: -200, nota: "venduti" })).rejects.toThrow("non se ne possono togliere 200");
    rows["products"] = [PHOENIX, { ...PHOENIX, id: 3, sku: "SOAR-PHOENIX-SOLO", name: "Soar Phoenix 9-60GF solo trottola" }];
    await expect(prepare("cambia_prezzo", { prodotto: "phoenix", prezzo_eur: 18 })).rejects.toThrow("Più prodotti");
  });

  it("say on the card when a customer gets an email or a price goes under cost", async () => {
    expect((await prepare("spedisci_ordine", { ordine: "GD-ESZGLRU5", corriere: "poste", codice: "JF400012345678" })).card.warning).toContain("email");
    const price = (await prepare("cambia_prezzo", { prodotto: "SOAR-PHOENIX-9-60GF", prezzo_eur: 9 })).card;
    expect(price).toMatchObject({ input: { priceCents: 900, belowCost: true } });
    expect(price.warning).toContain("sotto il costo medio");
    expect((await prepare("movimento_magazzino", { prodotto: "SOAR-PHOENIX-9-60GF", variazione: -2, nota: "Venduti a mano a 20 €" })).card.title).toBe(
      "Soar Phoenix 9-60GF: -2 pezzi (184 → 182)",
    );
  });
});

describe("a confirmed card", () => {
  it("walks an order through each status with the panel's own action", async () => {
    rows["orders"] = [{ id: 19, order_number: "GD-ESZGLRU5", status: "confirmed", payment_status: "paid" }];
    const { card } = await prepare("cambia_stato_ordine", { ordine: "GD-ESZGLRU5", stato: "spedito" });
    const result = await executeCopilotAction(card, fakeClient(), 1);
    expect(result).toEqual({ ok: true, message: "Ordine GD-ESZGLRU5 ora spedito." });
    expect(transitionOrderAction.mock.calls.map(([, form]) => form.get("toStatus"))).toEqual(["processing", "shipped"]);
  });

  it("takes pieces off with the reduction confirmed, and sells under cost only when the card said so", async () => {
    const stock = (await prepare("movimento_magazzino", { prodotto: "SOAR-PHOENIX-9-60GF", variazione: -2, nota: "Venduti a mano a 20 €" })).card;
    await executeCopilotAction(stock, fakeClient(), 1);
    const sent = adjustInventoryAction.mock.calls[0]![1];
    expect([sent.get("sku"), sent.get("delta"), sent.get("reason"), sent.get("confirmReduction")]).toEqual(["SOAR-PHOENIX-9-60GF", "-2", "manual_adjustment", "on"]);

    const price = (await prepare("cambia_prezzo", { prodotto: "SOAR-PHOENIX-9-60GF", prezzo_eur: 17.9 })).card;
    await executeCopilotAction(price, fakeClient(), 1);
    expect(setListPriceAction.mock.calls[0]![1].get("price")).toBe("17,90");
    expect(setListPriceAction.mock.calls[0]![1].get("belowCostConfirmed")).toBeNull();
  });

  it("refuses a card whose input was changed in the browser", async () => {
    const { card } = await prepare("cambia_stato_ordine", { ordine: "GD-ESZGLRU5", stato: "spedito" });
    await expect(executeCopilotAction({ ...card, input: { ...card.input, to: "refunded" } }, fakeClient(), 1)).rejects.toThrow();
    expect(transitionOrderAction).not.toHaveBeenCalled();
  });
});
