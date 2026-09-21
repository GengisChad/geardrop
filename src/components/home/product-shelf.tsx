import { ProductCard } from "@/components/product/product-card";
import { Kicker } from "@/components/ui/kicker";
import type { Product } from "@/lib/commerce/types";

/** A titled row of product cards: two across on a phone, four from lg. */
export function ProductShelf({
  products,
  kicker,
  title,
  note,
  testId,
}: {
  readonly products: readonly Product[];
  readonly kicker: string;
  readonly title: string;
  readonly note?: string;
  readonly testId: string;
}) {
  if (products.length === 0) return null;
  return (
    <section
      data-testid={testId}
      aria-labelledby={`${testId}-title`}
      className="mx-auto max-w-[1400px] px-4 pb-10 sm:px-6 lg:px-10 lg:pb-14"
    >
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Kicker>{kicker}</Kicker>
          <h2 id={`${testId}-title`} className="gd-display-wide mt-2 text-[1.9rem] font-bold leading-[0.95] sm:text-[2.5rem]">
            {title}
          </h2>
        </div>
        {note ? <p className="text-small text-grey-600">{note}</p> : null}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:gap-5">
        {products.map((product) => (
          <li key={product.slug}>
            <ProductCard product={product} showTagline />
          </li>
        ))}
      </ul>
    </section>
  );
}
