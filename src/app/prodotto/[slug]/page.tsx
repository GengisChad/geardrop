import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, Boxes, Crosshair, Target, Zap } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Gallery } from "@/components/product/gallery";
import { BuyPanel } from "@/components/product/buy-panel";
import { ProductDetails } from "@/components/product/product-details";
import { StickyBuyBar } from "@/components/product/sticky-buy-bar";
import { ProductCarousel } from "@/components/product/product-carousel";
import { Rating } from "@/components/ui/rating";
import { TrustBarLight } from "@/components/home/trust";
import { PRODUCTS } from "@/data/catalog";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { formatPrice } from "@/lib/format";
import { BLADE_TYPE_LABEL, CATEGORY_LABEL } from "@/lib/labels";

type Params = { slug: string };

const FEATURE_ICONS = [Target, Boxes, Zap, BadgeCheck, Crosshair] as const;

export function generateStaticParams(): Params[] {
  return PRODUCTS.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const commerce = await getCommerceProvider();
  const product = await commerce.getProduct((await params).slug);
  if (!product) return { title: "Prodotto non trovato" };
  return {
    title: product.name,
    description: product.tagline,
    openGraph: {
      title: product.name,
      description: product.tagline,
      images: product.images[0] ? [{ url: product.images[0].src }] : [],
    },
  };
}

export default async function ProdottoPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const commerce = await getCommerceProvider();
  const product = await commerce.getProduct(slug);
  if (!product) notFound();

  const related = await commerce.getProductsBySlugs(product.relatedSlugs);

  // Product structured data: this is what makes the price and availability eligible for
  // rich results, and it must track the catalogue rather than be written by hand.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images.map((image) => image.src),
    category: CATEGORY_LABEL[product.category],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: product.reviewCount,
    },
    offers: {
      "@type": "Offer",
      price: (product.price.amount / 100).toFixed(2),
      priceCurrency: product.price.currency,
      availability:
        product.stock === "esaurito"
          ? "https://schema.org/OutOfStock"
          : product.stock === "pre-ordine"
            ? "https://schema.org/PreOrder"
            : "https://schema.org/InStock",
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Negozio", href: "/negozio" },
            { label: CATEGORY_LABEL[product.category], href: `/negozio/${product.category}` },
            { label: product.name },
          ]}
        />
      </div>

      <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-6 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:py-10">
        <Gallery
          images={product.images}
          slug={product.slug}
          name={product.name}
          {...(product.tags[0] ? { promo: product.tags[0] } : {})}
        />

        <div>
          <p className="gd-display-wide flex items-center gap-1.5 text-small font-bold tracking-[0.2em] text-grey-600">
            Beyblade <span className="text-lime-ink">X</span>
          </p>

          <h1 className="gd-display-wide mt-3 text-[2rem] font-extrabold leading-[1.02] text-graphite sm:text-[2.5rem]">
            {product.name}
          </h1>

          {product.bladeType ? (
            <p className="mt-3 flex items-center gap-2">
              <span className="gd-display inline-flex items-center gap-1.5 rounded-full bg-violet-tint px-2.5 py-1 text-[0.6875rem] font-bold tracking-wider text-violet">
                <Zap className="size-3" aria-hidden="true" />
                {BLADE_TYPE_LABEL[product.bladeType]}
              </span>
            </p>
          ) : null}

          <div className="mt-4">
            <Rating value={product.rating} count={product.reviewCount} size="md" showValue />
          </div>

          <p className="mt-5 flex items-baseline gap-3">
            <span className="tabular gd-display text-[2rem] font-extrabold text-graphite" data-testid="pdp-price">
              {formatPrice(product.price)}
            </span>
            <span className="text-small text-grey-600">IVA inclusa</span>
          </p>

          <p className="mt-5 max-w-lg text-small leading-relaxed text-grey-600">{product.description}</p>

          <ul className="mt-6 flex flex-col gap-3.5">
            {product.features.map((feature, index) => {
              const Icon = FEATURE_ICONS[index % FEATURE_ICONS.length] ?? Target;
              return (
                <li key={feature.title} className="flex items-start gap-3">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-tint">
                    <Icon className="size-4 text-violet" strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="gd-display block text-[0.6875rem] font-bold tracking-wider text-graphite">
                      {feature.title}
                    </span>
                    <span className="block text-small leading-tight text-grey-600">{feature.description}</span>
                  </span>
                </li>
              );
            })}
          </ul>

          <div id="buy-panel" className="mt-8">
            <BuyPanel product={product} />
          </div>
        </div>
      </div>

      <TrustBarLight className="pb-4" />

      <ProductDetails product={product} />

      <ProductCarousel title="Si abbina bene con" products={related} href="/negozio" className="pb-16" />

      <StickyBuyBar product={product} />
    </>
  );
}
