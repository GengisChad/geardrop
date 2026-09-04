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

/** Sub-line shown next to the status in the legend and on the PDP panel. */
export const STOCK_HINT: Record<StockStatus, string> = {
  disponibile: "Disponibilità indicata nel catalogo",
  "in-arrivo": "Disponibilità in aggiornamento",
  "pre-ordine": "Spedizione entro 14 giorni dalla conferma; il transito del corriere inizia dopo la spedizione",
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

/**
 * Promo pill treatment. The design system draws "Offerta" as pale lime on white,
 * which fails contrast; it is rendered as graphite-on-lime instead. (audit §9)
 */
export const PROMO_CHIP: Record<PromoTag, string> = {
  novita: "border border-violet/40 bg-white text-violet",
  offerta: "bg-lime text-graphite",
  limited: "bg-graphite text-white",
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
