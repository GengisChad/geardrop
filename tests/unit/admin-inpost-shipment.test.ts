import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createLockerShipment = vi.fn();
const sendEmail = vi.fn(async () => ({ ok: true as const, id: "email-1" }));
let client: ReturnType<typeof fakeClient>;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireUser: vi.fn(async () => ({ id: "owner" })), requireStaffRole: vi.fn(async () => "owner") }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
vi.mock("@/lib/email/resend", () => ({ sendEmail, SHOP_EMAIL: "infogeardrop@gmail.com" }));
vi.mock("@/lib/shipping/inpost", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shipping/inpost")>();
  return { ...actual, createInpostClient: () => ({ createLockerShipment }) };
});

const { createInpostShipmentAction } = await import("@/app/admin/actions/orders");
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
