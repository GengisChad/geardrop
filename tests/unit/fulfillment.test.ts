import { describe, expect, it } from "vitest";
import { pickList, selectedOrderIds, shippingAddress, waitsForGoods } from "@/lib/admin/fulfillment";

describe("shippingAddress", () => {
  it("reads the database checkout snapshot", () => {
    expect(shippingAddress({ recipient: "Mario Rossi", street: "Via Roma 1", postal_code: "20121", city: "Milano", province: "MI", country: "IT", notes: "Citofono" }))
      .toEqual({ name: "Mario Rossi", street: "Via Roma 1", postalCode: "20121", city: "Milano", province: "MI", country: "IT", phone: "", notes: "Citofono" });
  });

  it("reads the Stripe checkout snapshot", () => {
    expect(shippingAddress({ name: "Anna Bianchi", address: "Corso Italia 5, int. 3", postalCode: "00100", city: "Roma", province: "RM", country: "IT", phone: "+39 333" }))
      .toMatchObject({ name: "Anna Bianchi", street: "Corso Italia 5, int. 3", postalCode: "00100", phone: "+39 333" });
  });

  it("never throws on a malformed snapshot", () => {
    expect(shippingAddress(null)).toMatchObject({ name: "", country: "IT" });
    expect(shippingAddress(["x"])).toMatchObject({ street: "" });
  });
});

describe("pickList", () => {
  it("adds up each SKU across orders and keeps pre-orders apart", () => {
    const rows = pickList([
      { lines: [{ sku: "B-2", name: "Bey", quantity: 2, preorderQuantity: 0 }, { sku: "A-1", name: "Stadio", quantity: 1, preorderQuantity: 1 }] },
      { lines: [{ sku: "b-2", name: "Bey", quantity: 3, preorderQuantity: 1 }] },
    ]);
    expect(rows).toEqual([
      { sku: "A-1", name: "Stadio", quantity: 0, preorderQuantity: 1, orders: 1 },
      { sku: "B-2", name: "Bey", quantity: 4, preorderQuantity: 1, orders: 2 },
    ]);
  });

  it("marks an order made only of pre-ordered pieces as waiting for goods", () => {
    expect(waitsForGoods([{ sku: "A", name: "A", quantity: 2, preorderQuantity: 2 }])).toBe(true);
    expect(waitsForGoods([{ sku: "A", name: "A", quantity: 2, preorderQuantity: 1 }])).toBe(false);
    expect(waitsForGoods([])).toBe(false);
  });
});

describe("selectedOrderIds", () => {
  it("reads repeated and comma separated ids, once each, ignoring junk", () => {
    expect(selectedOrderIds(["3", "1,2", "3", "x", "-4"])).toEqual([3, 1, 2]);
    expect(selectedOrderIds("7")).toEqual([7]);
    expect(selectedOrderIds(undefined)).toEqual([]);
  });

  it("caps a print run at fifty orders", () => {
    expect(selectedOrderIds(Array.from({ length: 80 }, (_, index) => String(index + 1)))).toHaveLength(50);
  });
});
