import { beforeEach, describe, expect, it, vi } from "vitest";

type Product = { slug: string; price_cents: number; compare_at_price_cents: number | null };

let product: Product;
let averageCost: number | null;
const update = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
const geardrop = vi.hoisted(() => ({ id: 1, slug: "geardrop", name: "Gear Drop", storefrontPublic: true, role: "owner" as const }));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => ({ id: "owner" })),
  requireStaffRole: vi.fn(async () => ({ userId: "owner", role: "owner", active: true, organization: geardrop, organizations: [geardrop] })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        update: (values: unknown) => {
          update(values);
          return chain;
        },
        maybeSingle: async () =>
          table === "products"
            ? { data: product, error: null }
            : { data: averageCost === null ? null : { average_cost_cents: averageCost }, error: null },
        single: async () => ({ data: { default_vat_rate_bp: 2200 }, error: null }),
        then: (resolve: (value: unknown) => void) => resolve({ error: null }),
      };
      return chain;
    },
  }),
}));

const { setListPriceAction } = await import("@/app/admin/actions/products");

function form(price: string, confirmed = false): FormData {
  const data = new FormData();
  data.set("productId", "7");
  data.set("price", price);
  if (confirmed) data.set("belowCostConfirmed", "on");
  return data;
}

const initial = { ok: false, message: "" };

beforeEach(() => {
  product = { slug: "soar-phoenix", price_cents: 1299, compare_at_price_cents: null };
  averageCost = 800;
  update.mockClear();
});

describe("setListPriceAction", () => {
  it("saves a new price typed the Italian way", async () => {
    const state = await setListPriceAction(initial, form("14,90"));
    expect(update).toHaveBeenCalledWith({ price_cents: 1490 });
    expect(state).toEqual({ ok: true, message: "Prezzo salvato: €14,90. Sul sito entro pochi minuti." });
  });

  it("names the packs that stop costing less than their pieces at the new price", async () => {
    product = { slug: "shatter-horus-9-65gb", price_cents: 1199, compare_at_price_cents: null };
    const state = await setListPriceAction(initial, form("5,00", true));
    expect(state.ok).toBe(true);
    // Horus at 5,00: the duo (17,99), the Kit Doppio Starter (36,90) and the Trio Starter (29,90)
    // now cost as much as or more than their pieces; the arena kits and the Phoenix pack still save.
    expect(state.message).toContain("«Duo Shatter Horus + Hurricane Enlil»");
    expect(state.message).toContain("«Kit Doppio Starter»");
    expect(state.message).toContain("«Trio Starter»");
    expect(state.message).not.toContain("Kit Arena");
    expect(state.message).not.toContain("Pack Meta Phoenix");
  });

  it("asks before selling under the average cost, and saves once confirmed", async () => {
    const refused = await setListPriceAction(initial, form("9,00"));
    expect(refused).toMatchObject({ ok: false, needsConfirm: true });
    expect(refused.message).toContain("sotto il costo medio €8,00");
    expect(update).not.toHaveBeenCalled();

    expect((await setListPriceAction(initial, form("9,00", true))).ok).toBe(true);
    expect(update).toHaveBeenCalledWith({ price_cents: 900 });
  });

  it("keeps an offer's struck-through price above the new one", async () => {
    product = { ...product, compare_at_price_cents: 1500 };
    const state = await setListPriceAction(initial, form("15,00"));
    expect(state.ok).toBe(false);
    expect(state.message).toContain("prezzo barrato €15,00");
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a price that is not a price", async () => {
    expect((await setListPriceAction(initial, form("dodici"))).message).toBe("Scrivi il prezzo in euro, es. 12,99.");
    expect((await setListPriceAction(initial, form("0"))).ok).toBe(false);
  });
});
