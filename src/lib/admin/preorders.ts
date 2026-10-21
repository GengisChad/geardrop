/**
 * The pre-order desk (owner, 2026-10-11): who paid for a pre-order, for which piece, and whether
 * it has gone out yet. When the pieces land the owner works down the "da evadere" list, oldest
 * payment first, and ships each order from its own page (tracking + the buyer's email).
 *
 * A pre-order line is any paid order line with pre-ordered pieces (order_items.preorder_quantity):
 * a release pre-order (Croc, Drake, …) or, before 2026-10-08, pieces bought past an empty shelf.
 *
 * An order that also held pieces from the shelf (possible until 2026-10-08) ships in two parcels:
 * its status turns "shipped" with the first, which says nothing about the pre-order (GD-H45SJKCN
 * left on 2026-10-09 without its Strike Dran). Such an order counts as fulfilled only once an
 * internal note starting with PREORDER_SHIPPED_NOTE says the pre-order went out too.
 */

/** The internal order note that records the pre-order parcel of an order that shipped in two. */
export const PREORDER_SHIPPED_NOTE = "PRE-ORDINE SPEDITO";

export type PreorderOrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "completed" | "cancelled";

export type PreorderItemRow = {
  readonly order_id: number;
  readonly sku_snapshot: string;
  readonly product_name_snapshot: string;
  readonly quantity: number;
  readonly preorder_quantity: number;
};

export type PreorderOrderRow = {
  readonly id: number;
  readonly order_number: string;
  readonly created_at: string;
  readonly status: PreorderOrderStatus;
  readonly payment_status: string;
  readonly email: string;
  readonly phone: string | null;
  readonly total_cents: number;
  readonly shipped_at: string | null;
  readonly tracking_code: string | null;
  readonly shipping_address_snapshot: unknown;
};

export type PreorderNoteRow = {
  readonly order_id: number;
  readonly note: string;
  readonly created_at: string;
};

export type PreorderView = "da-evadere" | "evasi" | "tutti";

export type PreorderLine = {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  /** Of `quantity`, the pieces still waiting for the release (the rest shipped from the shelf). */
  readonly preordered: number;
};

export type PreorderOrder = {
  readonly id: number;
  readonly orderNumber: string;
  readonly createdAt: string;
  readonly status: PreorderOrderStatus;
  readonly fulfilled: boolean;
  /** The order also held pieces from the shelf: they ship apart from the pre-order. */
  readonly mixed: boolean;
  /** A mixed order whose shelf pieces already left, while the pre-order has not. */
  readonly shelfShipped: boolean;
  /** When the pre-order parcel of a mixed order was recorded as sent, and the note that says so. */
  readonly preorderShippedAt: string | null;
  readonly preorderShippedNote: string | null;
  readonly email: string;
  readonly phone: string | null;
  readonly buyer: string | null;
  readonly destination: string | null;
  readonly totalCents: number;
  readonly trackingCode: string | null;
  readonly lines: readonly PreorderLine[];
};

export type PreorderProduct = {
  readonly sku: string;
  readonly name: string;
  /** Pieces paid for and not shipped yet: what to set aside when the shipment lands. */
  readonly openPieces: number;
  readonly openOrders: number;
  readonly shippedPieces: number;
};

export type PreorderBoard = {
  readonly products: readonly PreorderProduct[];
  readonly orders: readonly PreorderOrder[];
  readonly openOrders: number;
  readonly openPieces: number;
};

/** Shipped or delivered: the pre-order has been fulfilled. */
const isFulfilled = (status: PreorderOrderStatus) => status === "shipped" || status === "completed";

function text(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The buyer's name and where the parcel goes: the InPost point, or the town and province. */
export function buyerOf(snapshot: unknown): { readonly buyer: string | null; readonly destination: string | null } {
  const record = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? (snapshot as Record<string, unknown>) : {};
  const buyer = text(record, "name") ?? text(record, "recipient");
  const pickup = text(record, "pickupPoint");
  const town = [text(record, "city"), text(record, "province")].filter(Boolean).join(" ");
  return { buyer, destination: pickup ? `InPost: ${pickup}` : town || null };
}

/**
 * Builds the desk from the raw rows: paid orders only (a refunded or cancelled order is not owed
 * anything), oldest first so the first to pay is the first served, and a per-product count of the
 * pieces still to ship. `items` carries every line of those orders, so a mixed order is known.
 */
export function preorderBoard(
  items: readonly PreorderItemRow[],
  orders: readonly PreorderOrderRow[],
  options: { readonly view?: PreorderView; readonly sku?: string; readonly notes?: readonly PreorderNoteRow[] } = {},
): PreorderBoard {
  const view = options.view ?? "da-evadere";
  const linesByOrder = new Map<number, PreorderLine[]>();
  const mixedOrders = new Set<number>();
  for (const item of items) {
    if (item.preorder_quantity < item.quantity) mixedOrders.add(item.order_id);
    if (item.preorder_quantity <= 0) continue;
    const lines = linesByOrder.get(item.order_id) ?? [];
    lines.push({ sku: item.sku_snapshot, name: item.product_name_snapshot, quantity: item.quantity, preordered: item.preorder_quantity });
    linesByOrder.set(item.order_id, lines);
  }
  const shippedNotes = new Map<number, PreorderNoteRow>();
  for (const note of options.notes ?? []) {
    if (!note.note.trim().toUpperCase().startsWith(PREORDER_SHIPPED_NOTE)) continue;
    const earlier = shippedNotes.get(note.order_id);
    if (!earlier || note.created_at < earlier.created_at) shippedNotes.set(note.order_id, note);
  }

  const owed = orders
    .filter((order) => order.payment_status === "paid" && order.status !== "cancelled" && linesByOrder.has(order.id))
    .map((order): PreorderOrder => {
      const { buyer, destination } = buyerOf(order.shipping_address_snapshot);
      const mixed = mixedOrders.has(order.id);
      const marker = shippedNotes.get(order.id) ?? null;
      return {
        id: order.id,
        orderNumber: order.order_number,
        createdAt: order.created_at,
        status: order.status,
        fulfilled: marker !== null || (!mixed && isFulfilled(order.status)),
        mixed,
        shelfShipped: mixed && isFulfilled(order.status),
        preorderShippedAt: marker?.created_at ?? null,
        preorderShippedNote: marker?.note.trim() ?? null,
        email: order.email,
        phone: order.phone,
        buyer,
        destination,
        totalCents: order.total_cents,
        trackingCode: order.tracking_code,
        lines: linesByOrder.get(order.id)!,
      };
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);

  const products = new Map<string, { sku: string; name: string; openPieces: number; openOrders: Set<number>; shippedPieces: number }>();
  for (const order of owed) {
    for (const line of order.lines) {
      const entry = products.get(line.sku) ?? { sku: line.sku, name: line.name, openPieces: 0, openOrders: new Set<number>(), shippedPieces: 0 };
      if (order.fulfilled) entry.shippedPieces += line.preordered;
      else {
        entry.openPieces += line.preordered;
        entry.openOrders.add(order.id);
      }
      products.set(line.sku, entry);
    }
  }

  const open = owed.filter((order) => !order.fulfilled);
  const shown = owed
    .filter((order) => (view === "tutti" ? true : view === "evasi" ? order.fulfilled : !order.fulfilled))
    .filter((order) => !options.sku || order.lines.some((line) => line.sku === options.sku));

  return {
    products: [...products.values()]
      .map(({ openOrders, ...rest }) => ({ ...rest, openOrders: openOrders.size }))
      .sort((a, b) => b.openPieces - a.openPieces || a.name.localeCompare(b.name, "it")),
    orders: shown,
    openOrders: open.length,
    openPieces: open.reduce((sum, order) => sum + order.lines.reduce((total, line) => total + line.preordered, 0), 0),
  };
}

export function normalizePreorderView(value: unknown): PreorderView {
  return value === "evasi" || value === "tutti" ? value : "da-evadere";
}
