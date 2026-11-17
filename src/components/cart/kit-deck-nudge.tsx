"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import { DECK_CASE_PRICE, DECK_CASE_WITH_KIT } from "@/data/catalog";
import { VARIANT_FAMILIES } from "@/data/variant-families";
import { useToast } from "@/components/ui/toast";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/lib/store/cart";

const euro = (amount: number) => formatPrice({ amount, currency: "EUR" }).replace(/,00$/, "");
const COLOURS = [...(VARIANT_FAMILIES["porta-deck-bicolore"]?.colours ?? []), ...(VARIANT_FAMILIES["porta-deck"]?.colours ?? [])];
const FAMILY_BY_SLUG = new Map(
  Object.values(VARIANT_FAMILIES).flatMap((family) => family.colours.map((colour) => [colour.slug as string, family.name] as const)),
);

/**
 * In the cart, a kit still without its deck case: one case per kit costs €15 instead of €18
 * (owner, 2026-10-24). A swatch adds that colour; the quote prices it.
 */
export function KitDeckNudge({ slots }: { readonly slots: number }) {
  const add = useCart((state) => state.add);
  const toast = useToast();
  if (slots <= 0) return null;

  return (
    <div data-testid="kit-deck-nudge" className="gd-hud relative flex flex-col gap-3 p-4">
      <p className="gd-mono flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-[0.14em] text-lime">
        <Package className="size-3.5" aria-hidden="true" />
        Porta deck con il kit
      </p>
      <p className="text-small leading-snug text-graphite">
        Con {slots === 1 ? "il tuo kit" : `i tuoi ${slots} kit`} un porta deck costa{" "}
        <strong>{euro(DECK_CASE_WITH_KIT)}</strong> invece di {euro(DECK_CASE_PRICE)}
        {slots > 1 ? ", uno per kit" : ""}. Scegli il colore:
      </p>
      <ul className="flex flex-wrap gap-2" aria-label="Colori del porta deck">
        {COLOURS.map((colour) => (
          <li key={colour.slug}>
            <button
              type="button"
              title={`${FAMILY_BY_SLUG.get(colour.slug) ?? "Porta Deck"} ${colour.label}`}
              aria-label={`Aggiungi ${FAMILY_BY_SLUG.get(colour.slug) ?? "Porta Deck"} ${colour.label}`}
              onClick={() => {
                add(colour.slug, 1);
                toast.push({ tone: "success", message: `Porta deck ${colour.label.toLowerCase()} nel carrello a ${euro(DECK_CASE_WITH_KIT)}.` });
              }}
              className="block size-8 rounded-full border border-white/20 transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime"
              style={{ background: colour.swatch }}
            />
          </li>
        ))}
      </ul>
      <Link href="/negozio/accessori" className="self-start text-[0.6875rem] font-semibold text-violet underline-offset-2 hover:underline">
        Vedi le foto dei porta deck
      </Link>
    </div>
  );
}
