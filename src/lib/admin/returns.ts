/**
 * Returns (owner, 2026-11-18): the pieces a buyer sends back go into stock, or are recorded as not
 * sellable, from the order page. The database function `record_order_return` does the work in one
 * transaction and keeps every return in the audit log, which is also where "already returned"
 * is read from.
 */

export type ReturnableLine = {
  readonly productId: number;
  readonly name: string;
  readonly sku: string;
  readonly sold: number;
  readonly returned: number;
};

type ItemLike = {
  readonly product_id: number | null;
  readonly product_name_snapshot: string;
  readonly sku_snapshot: string;
  readonly quantity: number;
};
type AuditLike = { readonly action: string; readonly after_state: unknown };

/** One line per product of the order, with what was sold and what came back already. */
export function returnableLines(items: readonly ItemLike[], auditEvents: readonly AuditLike[]): readonly ReturnableLine[] {
  const returned = new Map<number, number>();
  for (const event of auditEvents) {
    if (event.action !== "order.return_recorded") continue;
    const state = event.after_state && typeof event.after_state === "object" && !Array.isArray(event.after_state) ? (event.after_state as Record<string, unknown>) : null;
    const productId = Number(state?.["product_id"]);
    const quantity = Number(state?.["quantity"]);
    if (!Number.isSafeInteger(productId) || !Number.isSafeInteger(quantity)) continue;
    returned.set(productId, (returned.get(productId) ?? 0) + quantity);
  }
  const lines = new Map<number, ReturnableLine>();
  for (const item of items) {
    if (item.product_id === null) continue;
    const current = lines.get(item.product_id);
    lines.set(item.product_id, {
      productId: item.product_id,
      name: current?.name ?? item.product_name_snapshot,
      sku: current?.sku ?? item.sku_snapshot,
      sold: (current?.sold ?? 0) + item.quantity,
      returned: returned.get(item.product_id) ?? 0,
    });
  }
  return [...lines.values()];
}

export type ReturnRequestLine = { readonly product_id: number; readonly quantity: number; readonly restock: boolean };

/** The return form: `qty-<productId>` pieces and `condition-<productId>` = "vendibile" | "danneggiato". */
export function parseReturnForm(entries: Iterable<[string, FormDataEntryValue]>): readonly ReturnRequestLine[] | "invalid" {
  const quantities = new Map<number, string>();
  const conditions = new Map<number, string>();
  for (const [key, value] of entries) {
    if (typeof value !== "string") continue;
    const quantity = /^qty-(\d+)$/.exec(key);
    if (quantity) quantities.set(Number(quantity[1]), value.trim());
    const condition = /^condition-(\d+)$/.exec(key);
    if (condition) conditions.set(Number(condition[1]), value);
  }
  const lines: ReturnRequestLine[] = [];
  for (const [productId, text] of quantities) {
    if (text === "" || text === "0") continue;
    if (!/^\d{1,4}$/.test(text)) return "invalid";
    lines.push({ product_id: productId, quantity: Number(text), restock: conditions.get(productId) !== "danneggiato" });
  }
  return lines;
}

/** The database's refusals, in words the owner can act on. */
export function returnFailure(message: string): string {
  if (message.includes("GD_RETURN_TOO_MANY")) return "Più pezzi di quanti ne sono stati venduti (contando i resi già registrati).";
  if (message.includes("GD_RETURN_NOT_SHIPPED")) return "Il reso si registra solo per ordini spediti o consegnati.";
  if (message.includes("GD_RETURN_EMPTY")) return "Scrivi quanti pezzi sono tornati.";
  if (message.includes("GD_RETURN_INVALID_LINE")) return "Controlla quantità e nota (al massimo 500 caratteri).";
  if (message.includes("GD_PRODUCT_NOT_FOUND")) return "Prodotto non più in catalogo: non si può rimettere in magazzino.";
  if (message.includes("GD_ORDER_MANAGER_REQUIRED")) return "Permessi insufficienti.";
  return "Reso non registrato. Riprova.";
}
