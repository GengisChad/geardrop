import type { Product } from "@/lib/commerce/types";
import type { Database } from "@/lib/supabase/database.types";

export type MetaSnapshotRow = Database["public"]["Tables"]["meta_snapshots"]["Row"];
export type MetaRankingRow = Database["public"]["Tables"]["meta_rankings"]["Row"];
export type MetaVideoRow = Database["public"]["Tables"]["meta_videos"]["Row"];

export const META_TIERS = ["blade", "ratchet", "bit"] as const;
export type MetaTier = (typeof META_TIERS)[number];

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

/** "2026-10" as the page says it: "ottobre 2026". */
export function monthLabel(month: string): string {
  const [year, index] = month.split("-");
  const names = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
  ];
  const name = names[Number(index) - 1];
  return name ? `${name} ${year}` : month;
}
