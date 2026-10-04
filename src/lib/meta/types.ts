import type { Product } from "@/lib/commerce/types";
import type { Database } from "@/lib/supabase/database.types";

export type MetaSnapshotRow = Database["public"]["Tables"]["meta_snapshots"]["Row"];
export type MetaRankingRow = Database["public"]["Tables"]["meta_rankings"]["Row"];
export type MetaVideoRow = Database["public"]["Tables"]["meta_videos"]["Row"];

export const META_TIERS = ["blade", "ratchet", "bit"] as const;
export type MetaTier = (typeof META_TIERS)[number];

/** Where a piece moved since the previous list — the owner's own four words. */
export const META_TRENDS = ["stabile", "sale", "boom", "scende"] as const;
export type MetaTrend = (typeof META_TRENDS)[number];

export const TREND_LABEL: Record<MetaTrend, string> = {
  stabile: "Stabile",
  sale: "Sale",
  boom: "Boom",
  scende: "Scende",
};

/** The arrow that carries the movement at a glance, before anyone reads the word. */
export const TREND_MARK: Record<MetaTrend, string> = {
  stabile: "→",
  sale: "↑",
  boom: "↑↑",
  scende: "↓",
};

export function isMetaTrend(value: string | null): value is MetaTrend {
  return value !== null && (META_TRENDS as readonly string[]).includes(value);
}

export const TIER_LABEL: Record<MetaTier, string> = {
  blade: "Blade",
  ratchet: "Ratchet",
  bit: "Bit",
};

/**
 * What the page says under each tier, so a reader who has never built a deck knows what
 * the column is ranking before reading the rows.
 */
export const TIER_LEAD: Record<MetaTier, string> = {
  blade: "Il corpo della trottola: decide come colpisce e quanto incassa.",
  ratchet: "L'altezza e il peso dell'assetto: cambia come la trottola sta in arena.",
  bit: "La punta: decide se la trottola corre, resiste o resta in piedi.",
};

/**
 * A ranking row with the catalogue looked up.
 *
 * `product` is null both when the entry names no product and when it names one the
 * catalogue no longer knows; the page treats the two the same, because to a reader they
 * are the same — we cannot supply the piece.
 */
export type MetaEntry = MetaRankingRow & { readonly product: Product | null };

export type MetaSnapshot = MetaSnapshotRow & {
  readonly entries: Readonly<Record<MetaTier, readonly MetaEntry[]>>;
};

export type MetaArchiveItem = {
  readonly month: string;
  readonly title: string;
  readonly publishedAt: string | null;
  readonly updatedAt: string;
};

/** A period is a month the whole way through, or a single day when the meta moves weekly. */
export const PERIOD = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

const MONTH_NAMES = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
] as const;

/** "2026-10" reads "ottobre 2026"; "2026-10-05" reads "5 ottobre 2026". */
export function monthLabel(month: string): string {
  const [year, index, day] = month.split("-");
  const name = MONTH_NAMES[Number(index) - 1];
  if (!name) return month;
  return day ? `${Number(day)} ${name} ${year}` : `${name} ${year}`;
}
