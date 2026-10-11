import { describe, expect, it } from "vitest";
import { buyerOf, normalizePreorderView, preorderBoard, type PreorderItemRow, type PreorderOrderRow } from "@/lib/admin/preorders";

const order = (id: number, createdAt: string, extra: Partial<PreorderOrderRow> = {}): PreorderOrderRow => ({
  id,
  order_number: `GD-${id}`,
  created_at: createdAt,
  status: "confirmed",
  payment_status: "paid",
  email: `buyer${id}@example.com`,
  phone: null,
  total_cents: 2500,
  shipped_at: null,
  tracking_code: null,
  shipping_address_snapshot: { name: `Buyer ${id}`, city: "Milano", province: "MI" },
  ...extra,
});
const item = (orderId: number, sku: string, quantity: number, preordered: number): PreorderItemRow => ({
  order_id: orderId,
  sku_snapshot: sku,
  product_name_snapshot: sku === "TREAD-CROC-TQ-5-50GN" ? "Tread Croc TQ 5-50GN" : "Cobalt Drake 4-60F",
  quantity,
  preorder_quantity: preordered,
});

const CROC = "TREAD-CROC-TQ-5-50GN";
const DRAKE = "COBALT-DRAKE-4-60F";

describe("pre-order desk (owner, 2026-10-11)", () => {
  const items = [
    item(3, CROC, 2, 2),
    item(1, CROC, 1, 1),
    item(2, DRAKE, 1, 1),
    item(4, CROC, 1, 1),
    item(5, CROC, 1, 1),
    item(6, DRAKE, 1, 0), // shipped from the shelf: not a pre-order
  ];
  const orders = [
    order(3, "2026-10-03T10:00:00Z"),
    order(1, "2026-10-01T10:00:00Z"),
    order(2, "2026-10-02T10:00:00Z", { status: "shipped", tracking_code: "123456789012" }),
    order(4, "2026-10-04T10:00:00Z", { payment_status: "refunded" }),
    order(5, "2026-10-05T10:00:00Z", { status: "cancelled" }),
    order(6, "2026-10-06T10:00:00Z"),
  ];

  it("lists the paid pre-orders still to ship, first to pay first", () => {
    const board = preorderBoard(items, orders);
    expect(board.orders.map((entry) => entry.orderNumber)).toEqual(["GD-1", "GD-3"]);
    expect(board.openOrders).toBe(2);
    expect(board.openPieces).toBe(3);
  });

  it("counts per product what to set aside and what already went out", () => {
    const board = preorderBoard(items, orders);
    expect(board.products).toEqual([
      { sku: CROC, name: "Tread Croc TQ 5-50GN", openPieces: 3, openOrders: 2, shippedPieces: 0 },
      { sku: DRAKE, name: "Cobalt Drake 4-60F", openPieces: 0, openOrders: 0, shippedPieces: 1 },
    ]);
  });

  it("shows shipped ones apart, and narrows to one product", () => {
    expect(preorderBoard(items, orders, { view: "evasi" }).orders.map((entry) => entry.orderNumber)).toEqual(["GD-2"]);
    expect(preorderBoard(items, orders, { view: "tutti", sku: DRAKE }).orders.map((entry) => entry.orderNumber)).toEqual(["GD-2"]);
    expect(preorderBoard(items, orders, { view: "tutti" }).orders).toHaveLength(3);
  });

  it("names the buyer and where the parcel goes", () => {
    expect(buyerOf({ name: "Mario Rossi", city: "Milano", province: "MI" })).toEqual({ buyer: "Mario Rossi", destination: "Milano MI" });
    expect(buyerOf({ name: "Anna Bianchi", pickupPoint: "MIL123M" })).toEqual({ buyer: "Anna Bianchi", destination: "InPost: MIL123M" });
    expect(buyerOf(null)).toEqual({ buyer: null, destination: null });
  });

  it("defaults to the orders still to ship", () => {
    expect(normalizePreorderView(undefined)).toBe("da-evadere");
    expect(normalizePreorderView("evasi")).toBe("evasi");
    expect(normalizePreorderView("altro")).toBe("da-evadere");
  });
});
