import Image from "next/image";
import Link from "next/link";
import { Crosshair, Gauge, Shield, Sparkles } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { BLADE_TYPE_HINT, BLADE_TYPE_LABEL } from "@/lib/labels";
import type { BladeType, Product } from "@/lib/commerce/types";

const TYPE_ICON: Record<BladeType, typeof Shield> = {
  attacco: Crosshair,
  difesa: Shield,
  stamina: Gauge,
  bilanciato: Sparkles,
};

const ORDER: readonly BladeType[] = ["attacco", "difesa", "stamina", "bilanciato"];

/** "SCELTI PER IL COMPETITIVO" from mockup-home-lower: one card per archetype. */
export function CompetitivePicks({ products }: { products: readonly Product[] }) {
  const groups = ORDER.map((type) => ({
    type,
    picks: products.filter((product) => product.bladeType === type).slice(0, 2),
  })).filter((group) => group.picks.length > 0);

  if (groups.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6">
      <SectionHeading title="Scelti per il competitivo" href="/negozio/beyblade-x" linkLabel="Guida alle combo" />

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {groups.map(({ type, picks }) => {
          const Icon = TYPE_ICON[type];
          return (
            <li
              key={type}
              className="gd-glass-card gd-glass-interactive rounded-[--radius-glass] p-5"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-tint">
                  <Icon className="size-4.5 text-violet" strokeWidth={2} aria-hidden="true" />
                </span>
                <span>
                  <h3 className="text-small font-bold tracking-wider text-graphite">{BLADE_TYPE_LABEL[type]}</h3>
                  <p className="text-[0.6875rem] leading-tight text-grey-600">{BLADE_TYPE_HINT[type]}</p>
                </span>
              </div>

              <ul className="mt-4 grid grid-cols-2 gap-2">
                {picks.map((product) => {
                  const image = product.images[0];
                  return (
                    <li key={product.slug}>
                      <Link href={`/prodotto/${product.slug}`} className="group block text-center">
                        <span className="gd-product-plate block overflow-hidden rounded-xl p-2">
                          {image ? (
                            <Image
                              src={image.src}
                              alt=""
                              aria-hidden="true"
                              width={image.width}
                              height={image.height}
                              sizes="140px"
                              className="mx-auto h-16 w-auto object-contain transition-transform duration-500 ease-[--ease-out-gear] group-hover:scale-110"
                            />
                          ) : null}
                        </span>
                        <span className="mt-2 block text-[0.6875rem] font-medium leading-tight text-grey-600 transition-colors group-hover:text-violet">
                          {product.name}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <Link
                href={`/negozio/beyblade-x?type=${type}`}
                className="gd-display mt-4 block text-center text-[0.6875rem] font-bold tracking-wider text-violet hover:text-violet-ink"
              >
                Scopri
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
