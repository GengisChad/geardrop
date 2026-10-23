import { formatPrice } from "@/lib/format";
import type { Money } from "./types";

/**
 * Club pricing: partner clubs buy through the shop at a discount, priced by tier (owner, 2026-10-22).
 *
 * Fascia A, 15 %: tops from 20 € whose landed cost leaves the widest margin.
 * Fascia B, 10 %: the stadiums, Saber Samurai and the 12–15 € tops.
 * Fascia C, 0 %: everything else. Pieces of 10 € or less leave too little, bundles are already
 * discounted, the partner's consignment pieces earn the shop a fixed commission, and the
 * pre-order drop has no landed cost yet.
 *
 * A product missing from this list gets no club discount, so a new arrival is safe until someone
 * prices it on purpose.
 */
export const CLUB_DISCOUNT_PERCENT: Readonly<Record<string, number>> = {
  "soar-phoenix-9-60gf": 15,
  "glory-valkerion-lf": 15,
  "cobalt-dragoon-2-60c": 15,
  "blast-pegasus-a-tr": 15,
  "drop-attack-battle-set": 10,
  "sneak-attack-battle-set": 10,
  "saber-samurai-2-70l": 10,
  "impact-drake-9-60lr": 10,
  "hover-wyvern-3-85n": 10,
  "shatter-horus-9-65gb": 10,
  "hammer-incendio-3-70h": 10,
  "wand-wizard-1-60r": 10,
};

/** The club price holds from this cart value at full price: one parcel must carry enough pieces. */
export const CLUB_MIN_ORDER_CENTS = 15000;

export type Club = { readonly code: string; readonly name: string };

type Env = Readonly<Record<string, string | undefined>>;

const CODE_PATTERN = /^[A-Z0-9-]{4,40}$/;

export function normaliseClubCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * The clubs live in the server-only CLUB_CODES variable, never in the repository (it is public):
 * "ROYALBLADE=Royal Blade; CLUBNORD=Club Nord". A malformed entry is skipped, not guessed at.
 */
export function parseClubCodes(raw: string | undefined): ReadonlyMap<string, Club> {
  const clubs = new Map<string, Club>();
  for (const entry of (raw ?? "").split(/[;\n]/)) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const code = normaliseClubCode(entry.slice(0, separator));
    const name = entry.slice(separator + 1).trim();
    if (CODE_PATTERN.test(code) && name) clubs.set(code, { code, name });
  }
  return clubs;
}

export function findClub(code: string | undefined, env: Env = process.env): Club | null {
  if (!code) return null;
  return parseClubCodes(env["CLUB_CODES"]).get(normaliseClubCode(code)) ?? null;
}

/** The club price of one unit, rounded to the cent; the catalogue price when the product has no tier. */
export function clubUnitPrice(slug: string, unitPrice: Money): Money {
  const percent = CLUB_DISCOUNT_PERCENT[slug] ?? 0;
  return { amount: Math.round((unitPrice.amount * (100 - percent)) / 100), currency: unitPrice.currency };
}

export const CLUB_CODE_UNKNOWN = "Codice club non valido.";

export function clubMinimumMessage(missingCents: number): string {
  const euro = (amount: number) => formatPrice({ amount, currency: "EUR" });
  return `Il codice club vale da ${euro(CLUB_MIN_ORDER_CENTS)} di ordine: ne mancano ${euro(missingCents)}.`;
}
