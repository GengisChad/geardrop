import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as InpostModule from "@/lib/shipping/inpost";
import type * as WriteGuardModule from "@/lib/commerce/write-guard";

const createLockerShipment = vi.fn();
const sendEmail = vi.fn(async () => ({ ok: true as const, id: "email-1" }));
let client: ReturnType<typeof fakeClient>;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// The signed-in owner works for one company; the action reads its id off the principal.
const geardrop = vi.hoisted(() => ({ id: 1, slug: "geardrop", name: "Gear Drop", storefrontPublic: true, role: "owner" as const }));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => ({ id: "owner" })),
  requireStaffRole: vi.fn(async () => ({ userId: "owner", role: "owner", active: true, organization: geardrop, organizations: [geardrop] })),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
// The shop is not under maintenance: that freeze has its own test (admin-order-write-guard).
vi.mock("@/lib/commerce/write-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof WriteGuardModule>()),
  assertCommerceMaintenanceOpen: vi.fn(async () => undefined),
}));
vi.mock("@/lib/email/resend", () => ({ sendEmail, SHOP_EMAIL: "infogeardrop@gmail.com" }));
vi.mock("@/lib/shipping/inpost", async (importOriginal) => {
  const actual = await importOriginal<typeof InpostModule>();
  return { ...actual, createInpostClient: () => ({ createLockerShipment }) };
});

const { createInpostShipmentAction, createInpostShipmentsAction } = await import("@/app/admin/actions/orders");
const { InpostError } = await import("@/lib/shipping/inpost");

type Order = {
  id: number;
  order_number: string;
  email: string;
  phone: string | null;
  status: string;
  payment_status: string;
  tracking_carrier: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  shipping_notified_at: string | null;
  shipping_address_snapshot: Record<string, unknown>;
};

/** Just enough of the Supabase client for the ship flow: ship_order really ships the fake order. */
function fakeClient(order: Order) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "ship_order") Object.assign(order, { status: "shipped", tracking_carrier: args["p_carrier"], tracking_code: args["p_code"] ?? null });
    if (name === "mark_order_shipping_notified") order.shipping_notified_at = "2026-10-23T10:00:00Z";
    return { error: null };
  });
  const from = vi.fn(() => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: async () => ({ data: [{ product_name_snapshot: "Glory Valkerion LF", quantity: 1 }], error: null }),
      single: async () => ({ data: { ...order }, error: null }),
    };
    return chain;
  });
  return { rpc, from, order };
}

function paidOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 7,
    order_number: "GD-TEST0001",
    email: "mario@example.it",
    phone: "+39 333 1234567",
    status: "confirmed",
    payment_status: "paid",
    tracking_carrier: null,
    tracking_code: null,
    tracking_url: null,
    shipping_notified_at: null,
    shipping_address_snapshot: {
      name: "Mario Rossi",
      address: "Via Roma 1",
      postalCode: "00185",
      city: "Roma",
      province: "RM",
      country: "IT",
      method: "inpost-locker",
      methodLabel: "InPost · Locker",
      pickupPoint: "ITROM44128M · piazza dei Cinquecento 48, 00185 Roma",
      pickupPointId: "IT_ITROM44128M",
    },
    ...overrides,
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({ orderId: "7", lockerId: "", lockerLabel: "", size: "A", weightKg: "1", ...fields })) data.set(key, value);
  return data;
}

const initial = { ok: false, message: "" };

beforeEach(() => {
  vi.stubEnv("INPOST_CLIENT_ID", "app-test");
  vi.stubEnv("INPOST_CLIENT_SECRET", "secret");
  vi.stubEnv("INPOST_ORGANIZATION_ID", "org-1");
  vi.stubEnv("INPOST_SENDER_PHONE", "+390612345678");
  createLockerShipment.mockReset();
  sendEmail.mockClear();
});

afterEach(() => vi.unstubAllEnvs());

describe("createInpostShipmentAction", () => {
  it("makes the shipment from Gear Drop Shop to the buyer's Locker, ships the order and emails the tracking", async () => {
    client = fakeClient(paidOrder());
    createLockerShipment.mockResolvedValue("600000658493991742009752");

    const result = await createInpostShipmentAction(initial, form({ size: "B", weightKg: "1,5" }));

    expect(createLockerShipment).toHaveBeenCalledWith({
      orderNumber: "GD-TEST0001",
      recipient: { firstName: "Mario", lastName: "Rossi", email: "mario@example.it", phone: "+39 333 1234567" },
      lockerId: "IT_ITROM44128M",
      size: "B",
      weightKg: 1.5,
      senderEmail: "infogeardrop@gmail.com",
      senderPhone: "+390612345678",
    });
    expect(client.rpc).toHaveBeenCalledWith("ship_order", { p_order_id: 7, p_carrier: "InPost", p_code: "600000658493991742009752" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("600000658493991742009752");
  });

  it("never makes a second shipment for an order InPost already carries", async () => {
    client = fakeClient(paidOrder({ tracking_carrier: "InPost", tracking_code: "600" }));
    const result = await createInpostShipmentAction(initial, form({}));
    expect(createLockerShipment).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, message: "Spedizione InPost già creata: 600." });
  });

  it("asks for the Locker when the buyer typed it by hand, and notes the one the owner picks", async () => {
    const typed = paidOrder();
    delete typed.shipping_address_snapshot["pickupPointId"];
    client = fakeClient(typed);
    const missing = await createInpostShipmentAction(initial, form({}));
    expect(missing.ok).toBe(false);
    expect(missing.message).toContain("Scegli il Locker");
    expect(createLockerShipment).not.toHaveBeenCalled();

    createLockerShipment.mockResolvedValue("601");
    const picked = await createInpostShipmentAction(initial, form({ lockerId: "IT_ITFIA131314D", lockerLabel: "ITFIA131314D · Via Milano 19" }));
    expect(picked.ok).toBe(true);
    expect(createLockerShipment.mock.calls[0]![0]).toMatchObject({ lockerId: "IT_ITFIA131314D" });
    expect(client.rpc).toHaveBeenCalledWith("add_order_note", { p_order_id: 7, p_note: "Spedizione InPost verso il Locker ITFIA131314D · Via Milano 19." });
  });

  it("says which field InPost refused, and ships nothing", async () => {
    client = fakeClient(paidOrder());
    createLockerShipment.mockRejectedValue(new InpostError("refused", 400, { "recipient.phone": ["invalid"] }));
    const result = await createInpostShipmentAction(initial, form({}));
    expect(result).toEqual({ ok: false, message: "InPost non accetta il telefono del cliente. Correggi e riprova." });
    expect(client.rpc).not.toHaveBeenCalledWith("ship_order", expect.anything());
  });

  it("stops before calling InPost when the shop is not set up or the order is not ready", async () => {
    client = fakeClient(paidOrder());
    vi.stubEnv("INPOST_SENDER_PHONE", "");
    expect((await createInpostShipmentAction(initial, form({}))).message).toContain("INPOST_SENDER_PHONE");

    vi.stubEnv("INPOST_SENDER_PHONE", "+390612345678");
    client = fakeClient(paidOrder({ payment_status: "pending" }));
    expect((await createInpostShipmentAction(initial, form({}))).message).toBe("L'ordine non risulta pagato.");

    client = fakeClient(paidOrder({ status: "shipped" }));
    expect((await createInpostShipmentAction(initial, form({}))).ok).toBe(false);
    expect(createLockerShipment).not.toHaveBeenCalled();
  });
});

describe("createInpostShipmentsAction (spedizioni in blocco)", () => {
  /** Several fake orders behind one client: each query reads the order whose id it filtered on. */
  function fakeBatch(orders: Order[]) {
    const byId = new Map(orders.map((order) => [order.id, order]));
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      const order = byId.get(Number(args["p_order_id"]));
      if (name === "ship_order" && order) Object.assign(order, { status: "shipped", tracking_carrier: args["p_carrier"], tracking_code: args["p_code"] ?? null });
      if (name === "mark_order_shipping_notified" && order) order.shipping_notified_at = "2026-11-18T10:00:00Z";
      return { error: null };
    });
    const from = vi.fn(() => {
      let id = 0;
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          if (column === "id" || column === "order_id") id = Number(value);
          return chain;
        },
        order: async () => ({ data: [{ product_name_snapshot: "Glory Valkerion LF", quantity: 1 }], error: null }),
        single: async () => (byId.has(id) ? { data: { ...byId.get(id)! }, error: null } : { data: null, error: { message: "not found" } }),
      };
      return chain;
    });
    return { rpc, from, order: orders[0]! };
  }

  function batchForm(rows: Record<number, { size: string; weight: string }>): FormData {
    const data = new FormData();
    for (const [id, row] of Object.entries(rows)) {
      data.append("orderId", id);
      data.set(`size-${id}`, row.size);
      data.set(`weight-${id}`, row.weight);
    }
    return data;
  }

  const empty = { ok: false, message: "", results: [] };

  it("ships every chosen order with its own size and weight, and one refusal does not stop the rest", async () => {
    const first = paidOrder({ id: 7, order_number: "GD-TEST0007" });
    const refused = paidOrder({ id: 8, order_number: "GD-TEST0008" });
    const third = paidOrder({ id: 9, order_number: "GD-TEST0009" });
    client = fakeBatch([first, refused, third]);
    createLockerShipment
      .mockResolvedValueOnce("600000000000000000000007")
      .mockRejectedValueOnce(new InpostError("refused", 400, { "recipient.phone": ["invalid"] }))
      .mockResolvedValueOnce("600000000000000000000009");

    const state = await createInpostShipmentsAction(empty, batchForm({ 7: { size: "A", weight: "0,5" }, 8: { size: "A", weight: "1" }, 9: { size: "B", weight: "2" } }));

    expect(createLockerShipment).toHaveBeenCalledTimes(3);
    expect(createLockerShipment.mock.calls[0]![0]).toMatchObject({ orderNumber: "GD-TEST0007", size: "A", weightKg: 0.5 });
    expect(createLockerShipment.mock.calls[2]![0]).toMatchObject({ orderNumber: "GD-TEST0009", size: "B", weightKg: 2 });
    expect(state.results.map((result) => [result.orderNumber, result.ok, result.trackingNumber])).toEqual([
      ["GD-TEST0007", true, "600000000000000000000007"],
      ["GD-TEST0008", false, null],
      ["GD-TEST0009", true, "600000000000000000000009"],
    ]);
    expect(state.results[1]!.message).toBe("InPost non accetta il telefono del cliente. Correggi e riprova.");
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(first.status).toBe("shipped");
    expect(refused.status).toBe("confirmed");
    expect(state.ok).toBe(false);
    expect(state.message).toBe("2 spedizioni create su 3: controlla le righe in rosso.");
  });

  it("skips orders that already have their shipment and refuses a batch over the limit", async () => {
    client = fakeBatch([paidOrder({ id: 7, tracking_carrier: "InPost", tracking_code: "600" })]);
    const state = await createInpostShipmentsAction(empty, batchForm({ 7: { size: "A", weight: "1" } }));
    expect(createLockerShipment).not.toHaveBeenCalled();
    expect(state.results[0]).toMatchObject({ ok: false, message: "Spedizione InPost già creata: 600." });

    const many = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [index + 1, { size: "A", weight: "1" }]));
    expect((await createInpostShipmentsAction(empty, batchForm(many))).message).toBe("Al massimo 20 spedizioni per volta.");
  });

  it("checks the InPost setup once, before any order", async () => {
    client = fakeBatch([paidOrder()]);
    vi.stubEnv("INPOST_ORGANIZATION_ID", "");
    const state = await createInpostShipmentsAction(empty, batchForm({ 7: { size: "A", weight: "1" } }));
    expect(state.message).toContain("INPOST_ORGANIZATION_ID");
    expect(state.results).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });
});
