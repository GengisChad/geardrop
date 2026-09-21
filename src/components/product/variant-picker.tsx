import Link from "next/link";
import { cn } from "@/lib/cn";
import type { Product } from "@/lib/commerce/types";

/**
 * The colours of an item sold in several. Each swatch links to that colour's own page, so the
 * photo, price, availability and cart button on screen always belong to the colour picked.
 */
export function VariantPicker({ current, colours }: { current: Product; colours: readonly Product[] }) {
  if (!current.variant || colours.length < 2) return null;
  return (
    <div className="mt-5" data-testid="variant-picker">
      <p className="gd-display text-[0.6875rem] font-bold tracking-wider text-grey-600">
        Colore: <span className="text-graphite" data-testid="variant-current">{current.variant.label}</span>
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-2" aria-label="Scegli il colore">
        {colours.map((colour) => {
          const selected = colour.slug === current.slug;
          const label = colour.variant?.label ?? colour.name;
          return (
            <li key={colour.slug}>
              <Link
                href={`/prodotto/${colour.slug}`}
                scroll={false}
                replace
                aria-current={selected ? "true" : undefined}
                aria-label={colour.stock === "esaurito" ? `${label}, esaurito` : label}
                title={label}
                data-testid="variant-swatch"
                className={cn(
                  "grid size-11 place-items-center rounded-full border-2 transition-colors",
                  selected ? "border-lime" : "border-transparent hover:border-white/40",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("size-7 rounded-full ring-1 ring-inset ring-black/20", colour.stock === "esaurito" && "opacity-35")}
                  style={{ backgroundColor: colour.variant?.swatch }}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
