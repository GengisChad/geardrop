import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { fillerSpan, ShopTile } from "@/components/home/shop-tile";
import { ProductCard } from "@/components/product/product-card";
import { ProductFeature } from "@/components/home/product-feature";
import type { Product } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

/** "1 pezzo", "5 pezzi": the count beside a section title. */
export function piecesLabel(count: number): string {
  return `${count} ${count === 1 ? "pezzo" : "pezzi"}`;
}

/**
 * A home section title in the X-Rail grammar: the name, two lime slashes and the count, with
 * the delivery note and an optional link on the right, then the stadium rail. It replaces the
 * kicker that stood above every section.
 */
export function ShelfHeading({
  id,
  title,
  count,
  note,
  link,
  onViolet = false,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly count?: number;
  readonly note?: string;
  readonly link?: { readonly href: Route; readonly label: string };
  /** On the violet pre-order band the secondary text turns near-white. */
  readonly onViolet?: boolean;
  /** Extra controls on the right, such as the arsenal's filters. */
  readonly children?: ReactNode;
}) {
  return (
    <div className="mb-5 sm:mb-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 id={id} className={cn("gd-display-wide text-[1.85rem] font-extrabold leading-[0.95] sm:text-[2.9rem]", onViolet && "text-white")}>
            {title}{" "}
            <span aria-hidden="true" className="text-lime">
              {"//"}
            </span>
          </h2>
          {count !== undefined ? (
            <span className={cn("gd-mono text-[0.75rem] sm:text-small", onViolet ? "text-[#efe8ff]" : "text-grey-600")}>{piecesLabel(count)}</span>
          ) : null}
        </div>
        {note || link || children ? (
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 lg:justify-end">
            {note ? <p className={cn("text-small", onViolet ? "text-[#f4efff]" : "text-grey-600")}>{note}</p> : null}
            {link ? (
              <Link
                href={link.href}
                className={cn(
                  "gd-display inline-flex items-center gap-2 self-start border-b-2 border-lime pb-0.5 text-small font-bold tracking-[0.06em] transition-colors hover:text-lime",
                  onViolet ? "text-white" : "text-graphite",
                )}
              >
                {link.label}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
            {children}
          </div>
        ) : null}
      </div>
      <div aria-hidden="true" className={cn("gd-rail mt-4 sm:mt-5", onViolet && "opacity-90 [background-image:repeating-linear-gradient(90deg,rgba(255,255,255,0.4)_0_5px,transparent_5px_11px)]")} />
    </div>
  );
}

/**
 * A titled row of product cards: two across on a phone, four from lg. A row with a single
 * product shows it as one wide feature instead of a lone card beside an empty tile. The
 * pre-order row sits on a violet band: violet means "on its way" across the shop.
 */
export function ProductShelf({
  products,
  title,
  note,
  testId,
  tile,
  tone = "ink",
}: {
  readonly products: readonly Product[];
  readonly title: string;
  readonly note?: string;
  readonly testId: string;
  /** Fills the empty slots of a short last row with a "see more" tile. */
  readonly tile?: { readonly href: Route; readonly kicker: string; readonly title: string };
  readonly tone?: "ink" | "violet";
}) {
  if (products.length === 0) return null;
  const violet = tone === "violet";
  const [single] = products.length === 1 ? products : [];
  const link = tile ? { href: tile.href, label: tile.title } : undefined;
  const fiveAcross = !tile && products.length % 5 === 0 && products.length % 4 !== 0;

  const shelf = (
    <section
      data-testid={testId}
      aria-labelledby={`${testId}-title`}
      className={cn("relative mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10", violet ? "py-10 sm:py-16" : "pb-12 lg:pb-20")}
    >
      <ShelfHeading
        id={`${testId}-title`}
        title={title}
        count={products.length}
        onViolet={violet}
        {...(note ? { note } : {})}
        {...(single && link ? { link } : {})}
      />
      {single ? (
        <ProductFeature product={single} />
      ) : (
        // Five pieces stand in one row of five rather than four and a lone card.
        <ul className={cn("grid grid-cols-2 gap-2.5 sm:gap-4", fiveAcross ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
          {products.map((product) => (
            <li key={product.slug}>
              <ProductCard product={product} showTagline />
            </li>
          ))}
          {tile ? (
            <li className={fillerSpan(products.length, { base: 2, sm: 2, lg: 4 })} data-testid={`${testId}-tile`}>
              <ShopTile {...tile} />
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );

  if (!violet) return shelf;
  return (
    <div className="relative mb-12 overflow-hidden bg-violet lg:mb-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(-72deg,rgba(255,255,255,0.07)_0_2px,transparent_2px_22px)]"
      />
      <span
        aria-hidden="true"
        className="gd-watermark -right-8 top-4 hidden text-[13rem] uppercase [-webkit-text-stroke:2px_rgba(255,255,255,0.13)] lg:block"
      >
        In arrivo
      </span>
      {shelf}
    </div>
  );
}
