import { Carousel, CarouselSlide } from "@/components/ui/carousel";
import { ProductCard } from "@/components/product/product-card";
import { SectionHeading } from "@/components/ui/section-heading";
import type { AppHref } from "@/lib/routes";
import type { Product } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

type ProductCarouselProps = {
  title: string;
  products: readonly Product[];
  href?: AppHref;
  linkLabel?: string;
  /** "PIÙ VENDUTI" numbers its cards 1..n. */
  ranked?: boolean;
  showRating?: boolean;
  dots?: boolean;
  className?: string;
};

export function ProductCarousel({
  title,
  products,
  href,
  linkLabel,
  ranked = false,
  showRating = false,
  dots = false,
  className,
}: ProductCarouselProps) {
  if (products.length === 0) return null;

  return (
    <section data-testid="product-carousel" className={cn("gd-section-ambient", className)}>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <SectionHeading title={title} {...(href ? { href } : {})} {...(linkLabel ? { linkLabel } : {})} />
        <Carousel label={title} dots={dots} className="mt-6">
          {products.map((product, index) => (
            <CarouselSlide key={product.slug}>
              <ProductCard
                product={product}
                showRating={showRating}
                {...(ranked ? { rank: index + 1 } : {})}
                className="h-full"
              />
            </CarouselSlide>
          ))}
        </Carousel>
      </div>
    </section>
  );
}
