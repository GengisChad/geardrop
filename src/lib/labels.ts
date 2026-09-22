/**
 * Italian display strings for domain enums, plus their visual treatment.
 *
 * Kept in one place so a status can never render with two different labels or two
 * different colours across the app. (audit §5)
 */

import type { BladeType, CategorySlug, PromoTag, SortKey, StockStatus } from "@/lib/commerce/types";

export const STOCK_LABEL: Record<StockStatus, string> = {
  disponibile: "Disponibile",
  "in-arrivo": "In arrivo",
  "pre-ordine": "Pre-ordine",
  esaurito: "Esaurito",
};

/** Standard in-stock delivery promise shown across checkout, cart and the PDP trust bar. */
export const STANDARD_DELIVERY = "Consegna in 1-5 giorni lavorativi, a seconda del corriere";

/** How long a piece bought beyond the shelf may take, wherever a pre-order is sold or confirmed. */
export const PREORDER_DELIVERY = "Potrebbe arrivare tra 10/15 giorni lavorativi";

/** A drop that has not been released yet: it reaches Italy with Hasbro's release (owner, 2026-09-22). */
export const RELEASE_DELIVERY = "Arriva con l'uscita Hasbro, tra circa 20 giorni lavorativi, poi dipende dalle consegne";

/** The wait to show: the release one for an unreleased drop, the shelf one otherwise. */
export function preorderDelivery(releasePreorder?: boolean): string {
  return releasePreorder ? RELEASE_DELIVERY : PREORDER_DELIVERY;
}

/**
 * A delivery line used inside a sentence. Only the first letter drops its case, so a brand in
 * the middle of it keeps its own ("uscita Hasbro", never "uscita hasbro").
 */
export function deliveryClause(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Sub-line shown next to the status in the legend. A pre-order has two possible waits, so the
 * legend sends the shopper to the product, which knows which one it is; the product panel says
 * the wait itself (preorderDelivery).
 */
export const STOCK_HINT: Record<StockStatus, string> = {
  disponibile: "Disponibilità indicata nel catalogo",
  "in-arrivo": "Disponibilità in aggiornamento",
  "pre-ordine": "Tempi indicati su ogni scheda prodotto",
  esaurito: "Attualmente non disponibile",
};

/** Tailwind classes per status chip — the compact variant from design system §03. */
export const STOCK_CHIP: Record<StockStatus, string> = {
  disponibile: "bg-available-bg text-available",
  "in-arrivo": "bg-incoming-bg text-incoming",
  "pre-ordine": "bg-preorder-bg text-preorder",
  esaurito: "bg-soldout-bg text-soldout",
};

/** Solid dot used in the status legend. */
export const STOCK_DOT: Record<StockStatus, string> = {
  disponibile: "bg-available-solid",
  "in-arrivo": "bg-incoming-solid",
  "pre-ordine": "bg-preorder-solid",
  esaurito: "bg-soldout-solid",
};

/** The card CTA changes with availability (design system §09). */
export const STOCK_CTA: Record<StockStatus, string> = {
  disponibile: "Aggiungi",
  "in-arrivo": "Aggiungi",
  "pre-ordine": "Pre-ordina",
  esaurito: "Avvisami",
};

export const BLADE_TYPE_LABEL: Record<BladeType, string> = {
  attacco: "Attacco",
  difesa: "Difesa",
  stamina: "Stamina",
  bilanciato: "Bilanciato",
};

export const BLADE_TYPE_HINT: Record<BladeType, string> = {
  attacco: "Massimizza l'aggressività",
  difesa: "Resistenza e controllo",
  stamina: "Durata senza pari",
  bilanciato: "Versatilità totale",
};

export const PROMO_LABEL: Record<PromoTag, string> = {
  novita: "Novità",
  offerta: "Offerta",
  limited: "Limited",
  esclusiva: "Esclusiva",
};

/** Promo chip treatment on the dark theme: "Novità" wears the holographic foil. */
export const PROMO_CHIP: Record<PromoTag, string> = {
  novita: "bg-[image:var(--gradient-holo)] bg-[length:300%_100%] text-void animate-[gd-holo-text_4s_linear_infinite]",
  offerta: "bg-lime text-void",
  limited: "bg-graphite text-void",
  esclusiva: "bg-violet text-white",
};

export const CATEGORY_LABEL: Record<CategorySlug, string> = {
  "beyblade-x": "Beyblade X",
  lanciatori: "Lanciatori",
  stadi: "Stadi",
  accessori: "Accessori",
};

export const SORT_LABEL: Record<SortKey, string> = {
  popolari: "Più popolari",
  novita: "Novità",
  "prezzo-asc": "Prezzo crescente",
  "prezzo-desc": "Prezzo decrescente",
  nome: "Nome A-Z",
};

export const SORT_KEYS = Object.keys(SORT_LABEL) as SortKey[];

/** Availability that allows a normal add-to-cart. */
export function isPurchasable(stock: StockStatus): boolean {
  return stock !== "esaurito";
}

/** Units of a quote line that ship as a pre-order; a pre-order line without a split waits whole. */
export function preorderUnits(line: { readonly quantity: number; readonly stock: StockStatus; readonly preorderQuantity?: number }): number {
  return line.preorderQuantity ?? (line.stock === "pre-ordine" ? line.quantity : 0);
}

type DeliveryLine = {
  readonly quantity: number;
  readonly stock: StockStatus;
  readonly preorderQuantity?: number;
  readonly releasePreorder?: boolean;
};

/** The delivery line for a cart: in-stock time, pre-order time, or both when the cart mixes them. */
export function cartDelivery(lines: readonly DeliveryLine[]): string {
  const waiting = lines.reduce((sum, line) => sum + preorderUnits(line), 0);
  const total = lines.reduce((sum, line) => sum + line.quantity, 0);
  if (waiting === 0) return STANDARD_DELIVERY;
  // A cart that waits for a release waits at least that long, whatever else is in it.
  const release = lines.some((line) => line.releasePreorder && preorderUnits(line) > 0);
  if (waiting >= total) return preorderDelivery(release);
  return `${STANDARD_DELIVERY}; i pre-ordini ${release ? "arrivano con l'uscita Hasbro, tra circa 20 giorni lavorativi" : "potrebbero arrivare tra 10/15 giorni lavorativi"}`;
}

/** "1 in pre-ordine" or "In pre-ordine" when the whole line waits, followed by the delivery time. */
export function preorderNote(line: DeliveryLine): string | null {
  const units = preorderUnits(line);
  if (units <= 0) return null;
  return `${units >= line.quantity ? "In pre-ordine" : `${units} in pre-ordine`} · ${deliveryClause(preorderDelivery(line.releasePreorder))}`;
}
