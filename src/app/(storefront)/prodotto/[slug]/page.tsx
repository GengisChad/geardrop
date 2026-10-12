import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, Boxes, Crosshair, Target, Truck, Zap } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { BundleContents } from "@/components/product/bundle-contents";
import { DeliverySummary } from "@/components/product/delivery-summary";
import { BundleOffer } from "@/components/product/bundle-offer";
import { Gallery } from "@/components/product/gallery";
import { BuyPanel } from "@/components/product/buy-panel";
import { ProductDetails } from "@/components/product/product-details";
import { StickyBuyBar } from "@/components/product/sticky-buy-bar";
import { VariantPicker } from "@/components/product/variant-picker";
import { ProductCarousel } from "@/components/product/product-carousel";
import { Rating } from "@/components/ui/rating";
import { TrustBarLight } from "@/components/home/trust";
import { GaEvent } from "@/components/analytics/ga-event";
import { TrackPageView } from "@/components/funnel/track-page-view";
import { gaItem } from "@/lib/analytics/google";
import { BRANDS, BUNDLES, PRODUCTS, brandOf } from "@/data/catalog";
import { bundlesContaining } from "@/lib/commerce/bundles";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { familyColours, familyLead } from "@/lib/commerce/variants";
import { formatPrice } from "@/lib/format";
import { BLADE_TYPE_LABEL, CATEGORY_LABEL, bundleNoun, bundlePacks, preorderDelivery } from "@/lib/labels";
import { absoluteUrl, breadcrumbJsonLd, jsonLd, productDescription, productJsonLd, productTitle } from "@/lib/seo";

type Params = { slug: string };

const FEATURE_ICONS = [Target, Boxes, Zap, BadgeCheck, Crosshair] as const;

export function generateStaticParams(): Params[] {
  return [...BUNDLES, ...PRODUCTS].map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const commerce=await getCommerceProvider();
  const product = await commerce.getProduct((await params).slug);
  if (!product) return { title: "Prodotto non trovato" };
  const title = productTitle(product);
  const description = productDescription(product);
  const image = product.images[0];
  const images = image ? [{ url: absoluteUrl(image.src), width: image.width, height: image.height, alt: image.alt }] : [];
  return {
    title,
    description,
    // Every colour of an item is its own page; search engines index the family's leading colour.
    alternates: { canonical: `/prodotto/${familyLead(product)}` },
    openGraph: { type: "website", url: `/prodotto/${product.slug}`, title, description, images },
    twitter: { card: "summary_large_image", title, description, images: images.map((item) => item.url) },
  };
}

export default async function ProdottoPage({ params }: { params: Promise<Params> }) {
  const commerce=await getCommerceProvider();
  const { slug } = await params;
  const product = await commerce.getProduct(slug);
  if (!product) notFound();

  const related = await commerce.getProductsBySlugs(product.relatedSlugs);
  const colours = await commerce.getProductsBySlugs(familyColours(product).map((colour) => colour.slug));

  // A bundle lists its packs; a pack offers the bundle it belongs to, priced on live stock.
  const components = product.bundleOf ? await commerce.getProductsBySlugs(product.bundleOf.map((part) => part.slug)) : [];
  const [offer] = product.bundleOf
    ? []
    : await commerce.getProductsBySlugs(bundlesContaining(product.slug, BUNDLES).map((bundle) => bundle.slug));
  const partners =
    offer?.bundleOf
      ? await commerce.getProductsBySlugs(offer.bundleOf.map((part) => part.slug).filter((partSlug) => partSlug !== product.slug))
      : [];

  // Product structured data: price, live availability, shipping and returns make the page
  // eligible for Google's product results, and it tracks the catalogue rather than hand-written copy.
  const productData = productJsonLd(product);
  const breadcrumbData = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Negozio", path: "/negozio" },
    { name: CATEGORY_LABEL[product.category], path: `/negozio/${product.category}` },
    { name: product.name, path: `/prodotto/${product.slug}` },
  ]);

  return (
    <>
      <TrackPageView event="product_view" />
      <GaEvent
        name="view_item"
        params={{
          currency: "EUR",
          value: product.price.amount / 100,
          items: [gaItem({ slug: product.slug, name: product.name, priceCents: product.price.amount, quantity: 1, category: CATEGORY_LABEL[product.category] })],
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(productData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbData) }} />

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

      {/* Gallery gets the flexible share; buy column is capped at 540 px (xl: 580 px) so it
          never dominates the packshot on wide viewports. Gallery is made sticky inside its own
          component; buy column scrolls normally. (owner, 2026-10-12) */}
      <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:gap-12 lg:py-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,580px)]">
        <Gallery
          images={product.images}
          slug={product.slug}
          name={product.name}
          {...(product.tags[0] ? { promo: product.tags[0] } : {})}
        />

        <div data-testid="buy-panel" className="gd-glass-panel self-start rounded-[--radius-glass] p-5 sm:p-7">
          <p className="gd-display-wide flex items-center gap-1.5 text-small font-bold tracking-[0.2em] text-grey-600">
            {/* A compatible accessory is not a Beyblade X product, and says so before its name. */}
            {product.unofficial ? "Compatibile Beyblade" : "Beyblade"} <span className="text-lime-ink">X</span>
          </p>

          {/* Brand kicker: shown near the title so the buyer knows which manufacturer's line it is. */}
          {!product.unofficial ? (
            <p className="mt-1 text-[0.6875rem] font-semibold uppercase tracking-widest text-grey-500" data-testid="product-brand">
              {BRANDS.find((b) => b.slug === brandOf(product))?.name ?? "Hasbro"}
            </p>
          ) : null}

          <h1 className="gd-display-wide mt-3 text-[2rem] font-extrabold leading-[1.02] text-graphite sm:text-[2.5rem]">
            {product.name}
          </h1>

          {/* Consignment items are shipped by our partner, not from our shelf.
              Styled like a status line — icon + text in a subtle tinted strip — so it
              reads with the same weight as the availability badge. (owner, 2026-10-12) */}
          {product.consignment ? (
            <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2" data-testid="consignment-note">
              <Truck className="size-3.5 shrink-0 text-violet-soft" aria-hidden="true" />
              <p className="text-[0.6875rem] text-grey-600">
                Spedito dal nostro partner · consegna in 2-6 giorni lavorativi
              </p>
            </div>
          ) : null}

          {product.bundleOf ? (
            <p className="mt-3 flex items-center gap-2">
              <span className="gd-chamfer gd-display inline-flex items-center gap-1.5 bg-lime px-2.5 py-1 text-[0.6875rem] font-bold tracking-wider text-void">
                <Boxes className="size-3" aria-hidden="true" />
                Offerta {bundleNoun(product)} · {bundlePacks(product)} pezzi
              </span>
            </p>
          ) : null}

          {product.bladeType ? (
            <p className="mt-3 flex items-center gap-2">
              <span className="gd-display inline-flex items-center gap-1.5 rounded-full bg-violet-tint px-2.5 py-1 text-[0.6875rem] font-bold tracking-wider text-violet-soft">
                <Zap className="size-3" aria-hidden="true" />
                {BLADE_TYPE_LABEL[product.bladeType]}
              </span>
            </p>
          ) : null}

          {product.reviewCount > 0 ? (
            <div className="mt-4">
              <Rating value={product.rating} count={product.reviewCount} size="md" showValue />
            </div>
          ) : null}

          <p className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="tabular gd-display text-[2rem] font-extrabold text-graphite" data-testid="pdp-price">
              {formatPrice(product.price)}
            </span>
            {product.compareAtPrice ? (
              <>
                <span className="tabular text-body text-grey-400 line-through" data-testid="pdp-compare-price">
                  {formatPrice(product.compareAtPrice)}
                </span>
                <span className="gd-display rounded-full bg-lime/15 px-2.5 py-0.5 text-[0.6875rem] font-bold tracking-wider text-lime">
                  Risparmi {formatPrice({ amount: product.compareAtPrice.amount - product.price.amount, currency: "EUR" })}
                </span>
              </>
            ) : null}
            <span className="text-small text-grey-600">IVA inclusa</span>
          </p>

          <VariantPicker current={product} colours={colours} />

          {/* Price, availability and the cart button sit together, before the copy: on a phone the
              button used to land two screens below the price (critique, 2026-10-11). */}
          <div id="buy-panel" className="mt-6">
            <BuyPanel product={product} />
          </div>

          {/* Delivery block: shipping options, free threshold and return policy — or the partner
              timing for consignment / the pre-order wait. Placed right under the CTA so the buyer
              knows cost and timing before scrolling further. (owner, 2026-10-12) */}
          <DeliverySummary product={product} />

          {/* Box contents — inline compact list so the buyer sees what is in the box without
              opening the "Contenuto della confezione" tab. (owner, 2026-10-12) */}
          {product.boxContents.length > 0 ? (
            <div data-testid="box-contents-inline" className="mt-4">
              <p className="gd-display mb-2 text-[0.6875rem] font-bold tracking-wider text-grey-600">
                Nella scatola
              </p>
              <ul className="flex flex-col gap-1.5">
                {product.boxContents.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-small text-grey-600">
                    <span className="size-1.5 shrink-0 rounded-full bg-lime" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Feature highlights — compact on desktop since delivery info now sits above.
              The description lives in the Descrizione tab (product-details.tsx) and is
              no longer duplicated here. (owner, 2026-10-12) */}
          <ul className="mt-5 flex flex-col gap-2.5">
            {product.features.map((feature, index) => {
              const Icon = FEATURE_ICONS[index % FEATURE_ICONS.length] ?? Target;
              return (
                <li key={feature.title} className="flex items-start gap-2.5">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-tint">
                    <Icon className="size-3.5 text-violet-soft" strokeWidth={2} aria-hidden="true" />
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

          {product.bundleOf ? <BundleContents bundle={product} components={components} /> : null}
        </div>
      </div>

      {offer ? <BundleOffer bundle={offer} current={product} partners={partners} /> : null}

      <TrustBarLight className="pb-4" {...(product.stock === "pre-ordine" ? { delivery: preorderDelivery(product.releasePreorder) } : {})} />

      <ProductDetails product={product} />

      <ProductCarousel title="Si abbina bene con" products={related} href="/negozio" className="pb-16" />

      <StickyBuyBar product={product} />
    </>
  );
}
