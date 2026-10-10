/**
 * The warehouse station: which paid orders wait to be packed, what to pick for them, and the
 * address on the parcel. Pure helpers, shared by the station and its print view.
 */

export type ShippingAddress = {
  readonly name: string;
  readonly street: string;
  readonly postalCode: string;
  readonly city: string;
  readonly province: string;
  readonly country: string;
  readonly phone: string;
  readonly notes: string;
};

function field(record: Record<string, unknown>, ...keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * The delivery address of an order, whichever checkout wrote it: the database checkout stores
 * recipient/street/postal_code, the Stripe checkout name/address/postalCode.
 */
export function shippingAddress(snapshot: unknown): ShippingAddress {
  const record = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot as Record<string, unknown> : {};
  return {
    name: field(record, "recipient", "name"),
    street: field(record, "street", "address", "address1"),
    postalCode: field(record, "postal_code", "postalCode"),
    city: field(record, "city"),
    province: field(record, "province", "state"),
    country: field(record, "country") || "IT",
    phone: field(record, "phone"),
    notes: field(record, "notes"),
  };
}

export type PickableLine = {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly preorderQuantity: number;
};

export type PickListRow = {
  readonly sku: string;
  readonly name: string;
  /** Pieces to take from the shelf now. */
  readonly quantity: number;
  /** Pieces sold as pre-order: they ship when the goods arrive. */
  readonly preorderQuantity: number;
  readonly orders: number;
};

/** One row per SKU across the selected orders, in SKU order, so the shelf is walked once. */
export function pickList(orders: readonly { readonly lines: readonly PickableLine[] }[]): readonly PickListRow[] {
  const rows = new Map<string, { sku: string; name: string; quantity: number; preorderQuantity: number; orders: number }>();
  for (const order of orders) {
    const seen = new Set<string>();
    for (const line of order.lines) {
      const key = line.sku.toUpperCase();
      const row = rows.get(key) ?? { sku: line.sku, name: line.name, quantity: 0, preorderQuantity: 0, orders: 0 };
      const preorder = Math.min(Math.max(line.preorderQuantity, 0), line.quantity);
      row.quantity += line.quantity - preorder;
      row.preorderQuantity += preorder;
      if (!seen.has(key)) {
        row.orders += 1;
        seen.add(key);
      }
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((left, right) => left.sku.localeCompare(right.sku));
}

/** An order whose every piece is a pre-order cannot leave until the goods arrive. */
export function waitsForGoods(lines: readonly PickableLine[]): boolean {
  return lines.length > 0 && lines.every((line) => line.preorderQuantity >= line.quantity);
}

/** Order ids from the station's checkboxes (?ordini=1&ordini=2 or ?ordini=1,2), at most 50. */
export function selectedOrderIds(value: string | string[] | undefined): readonly number[] {
  const parts = (Array.isArray(value) ? value : [value ?? ""]).flatMap((item) => item.split(","));
  const ids = parts.map((part) => Number(part.trim())).filter((id) => Number.isSafeInteger(id) && id > 0);
  return [...new Set(ids)].slice(0, 50);
}
