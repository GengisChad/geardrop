import Image from "next/image";
import Link from "next/link";
import { cutoutSrc, packBoxes, productTops } from "@/data/assets";
import { formatPrice } from "@/lib/format";
import { holoStyle, kindLabel, productLine } from "@/lib/holo";
import type { Product } from "@/lib/commerce/types";

/** What a bundle ships, pack by pack, with what each would cost on its own. */
export function BundleContents({ bundle, components }: { readonly bundle: Product; readonly components: readonly Product[] }) {
  if (components.length === 0) return null;
  const separately = components.reduce((sum, item) => sum + item.price.amount, 0);

  return (
    <section aria-labelledby="bundle-contents-title" data-testid="bundle-contents" className="mt-7 border-t border-white/10 pt-6">
      <h2 id="bundle-contents-title" className="gd-mono text-[0.75rem] not-italic uppercase tracking-[0.16em] text-lime">
        Nel duo
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-2.5">
        {components.map((item) => {
          const top = productTops[item.slug];
          const image = item.images[0];
          // The box alone, with its top spinning beside it; the full packshot when no box crop exists.
          const box = packBoxes[item.slug];
          const line = productLine(item);
          return (
            <li key={item.slug} style={holoStyle(item)}>
              <Link
                href={`/prodotto/${item.slug}`}
                className="group relative flex h-full flex-col gap-2 border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-[var(--f2)]"
              >
                <span className="relative block aspect-square">
                  {box ? (
                    <Image src={box.src} alt="" fill sizes="160px" className="object-contain p-2 drop-shadow-[0_12px_18px_rgba(0,0,0,0.55)]" />
                  ) : image ? (
                    <Image src={cutoutSrc(image.src) ?? image.src} alt="" fill sizes="160px" className="object-contain" />
                  ) : null}
                  {top ? (
                    <Image
                      src={top}
                      alt=""
                      width={64}
                      height={64}
                      className="absolute -bottom-1 -right-1 size-14 animate-[gd-spin_1.2s_linear_infinite] drop-shadow-[0_8px_10px_rgba(0,0,0,0.6)] group-hover:[animation-duration:0.4s]"
                    />
                  ) : null}
                </span>
                <span className="gd-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--f2)]">
                  {[line, kindLabel(item)].filter(Boolean).join(" · ")}
                </span>
                <span className="gd-display-wide text-[0.95rem] font-bold leading-tight">{item.name}</span>
                <span className="tabular text-small text-grey-600">{formatPrice(item.price)} da solo</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-small text-grey-600">
        Separati <span className="tabular line-through">{formatPrice({ amount: separately, currency: "EUR" })}</span>, nel duo{" "}
        <strong className="tabular text-graphite">{formatPrice(bundle.price)}</strong>.
      </p>
    </section>
  );
}
