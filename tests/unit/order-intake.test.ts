import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { formatOrderNumber, placeOrder } from "@/lib/commerce/order-intake";
import type { PlaceOrderInput } from "@/lib/checkout-schema";

const contact = {
  email: "mario.rossi@email.it",
  firstName: "Mario",
  lastName: "Rossi",
  address: "Via Roma 1",
  city: "Milano",
  postalCode: "20121",
  province: "MI",
  phone: "+39 333 1234567",
  shippingMethod: "standard",
} as const;

const input: PlaceOrderInput = {
  contact,
  lines: [{ slug: "wizard-arrow-4-80b", quantity: 2 }],
  idempotencyKey: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607",
};

type FakeOptions = {
  readonly products?: readonly { id: number; slug: string }[];
  readonly orderId?: number | null;
  readonly rpcError?: { message: string } | null;
  /** What selecting the order back yields; guests get nothing, by RLS. */
  readonly orderRow?: { order_number: string; total_cents: number } | null;
};

function fakeClient(options: FakeOptions = {}) {
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
    data: options.orderId === undefined ? 42 : options.orderId,
    error: options.rpcError ?? null,
  }));

  const from = vi.fn((table: string) => {
    if (table === "products") {
      return {
        select: () => ({
          in: async () => ({
            data: options.products ?? [{ id: 7, slug: "wizard-arrow-4-80b" }],
            error: null,
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: options.orderRow ?? null, error: null }) }),
      }),
    };
  });

  return { client: { from, rpc } as never, rpc, from };
}

describe("formatOrderNumber", () => {
  it("matches the numbering the order intake migration commits", () => {
    // Guests cannot read their own row back, so the confirmation screen derives the
    // number. If the SQL format ever changes, this fails instead of the UI lying.
    const directory = join(process.cwd(), "supabase", "migrations");
    const sql = readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => readFileSync(join(directory, name), "utf8"))
      .join("\n");

    expect(sql).toContain("'GD-'||lpad(target_order_id::text,8,'0')");
    expect(formatOrderNumber(42)).toBe("GD-00000042");
    expect(formatOrderNumber(12345678)).toBe("GD-12345678");
  });
});

describe("placeOrder", () => {
  it("sends only identifiers and quantities to the database", async () => {
    const { client, rpc } = fakeClient();
    await placeOrder(client, input);

    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args["p_lines"]).toEqual([{ product_id: 7, quantity: 2 }]);
    // No amount of any kind crosses the boundary.
    expect(JSON.stringify(args)).not.toMatch(/cents|subtotal|total|price|discount/i);
  });

  it("never lets the caller name the customer", async () => {
    const { client, rpc } = fakeClient();
    await placeOrder(client, input);

    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(args)).not.toContain("p_customer_id");
    expect(JSON.stringify(args)).not.toMatch(/customer/i);
  });

  it("passes the idempotency key straight through, so a retry is not a second order", async () => {
    const { client, rpc } = fakeClient();
    await placeOrder(client, input);
    await placeOrder(client, input);

    const first = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    const second = rpc.mock.calls[1]?.[1] as Record<string, unknown>;
    expect(first["p_idempotency_key"]).toBe(input.idempotencyKey);
    expect(second["p_idempotency_key"]).toBe(input.idempotencyKey);
  });

  it("snapshots the delivery address and keeps courier notes with it", async () => {
    const { client, rpc } = fakeClient();
    await placeOrder(client, { ...input, contact: { ...contact, notes: "Citofono Rossi" } });

    const args = rpc.mock.calls[0]?.[1] as Record<string, Record<string, unknown>>;
    expect(args["p_shipping_address"]).toMatchObject({
      recipient: "Mario Rossi",
      street: "Via Roma 1",
      city: "Milano",
      postal_code: "20121",
      province: "MI",
      country: "IT",
      notes: "Citofono Rossi",
    });
  });

  it("normalises an absent coupon to the empty string the SQL treats as null", async () => {
    const { client, rpc } = fakeClient();
    await placeOrder(client, input);

    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args["p_coupon_code"]).toBe("");
  });

  it("reads the authoritative order number back when the buyer may see it", async () => {
    const { client } = fakeClient({ orderRow: { order_number: "GD-00000042", total_cents: 5488 } });
    const order = await placeOrder(client, input);

    expect(order.orderNumber).toBe("GD-00000042");
    expect(order.total).toEqual({ amount: 5488, currency: "EUR" });
  });

  it("derives the number, and reports no total, for a guest who cannot read the row", async () => {
    const { client } = fakeClient({ orderRow: null, orderId: 42 });
    const order = await placeOrder(client, input);

    expect(order.orderNumber).toBe("GD-00000042");
    expect(order.total).toBeNull();
  });

  it("refuses a cart line whose product no longer resolves", async () => {
    const { client, rpc } = fakeClient({ products: [] });

    await expect(placeOrder(client, input)).rejects.toThrow("GD_PRICING_PRODUCT_UNAVAILABLE");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("propagates a database refusal instead of inventing an order", async () => {
    const { client } = fakeClient({ rpcError: { message: "GD_ORDER_INTAKE_DISABLED" }, orderId: null });

    await expect(placeOrder(client, input)).rejects.toMatchObject({
      message: "GD_ORDER_INTAKE_DISABLED",
    });
  });
});
