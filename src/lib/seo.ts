import { FREE_SHIPPING_THRESHOLD, SHIPPING_METHODS } from "@/data/catalog";
import { brand } from "@/data/assets";
import { SELLER } from "@/data/pages";
import { SHOP_EMAIL } from "@/lib/email/resend";
import { formatPrice } from "@/lib/format";
import { CATEGORY_LABEL, FREE_SHIPPING_FROM_LABEL, SHIPPING_FLAT_LABEL, stockLabel } from "@/lib/labels";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import type { CategorySlug, Product } from "@/lib/commerce/types";

/**
 * Search metadata and schema.org data, derived from the catalogue so prices, stock and
 * policies in Google's results always match what the page shows.
 */

export const SITE_NAME = "GEAR//DROP";
export const DEFAULT_TITLE = "GEAR//DROP · Negozio Beyblade X in Italia";
export const DEFAULT_DESCRIPTION =
  `Negozio online di Beyblade X in Italia: trottole, starter, lanciatori e stadi disponibili. Pagamento sicuro con Stripe, spedizione da ${SHIPPING_FLAT_LABEL}, gratis da ${FREE_SHIPPING_FROM_LABEL}.`;

/** Returns are free within this many days of delivery (see the "Resi e rimborsi" page). */
const RETURN_DAYS = 30;
const DESCRIPTION_LIMIT = 160;

export function absoluteUrl(path: string): string {
  return new URL(path, PRODUCTION_ORIGIN).toString();
}

/** Every product is a Beyblade X item; the line name is what people type into Google. */
export function productTitle(product: Pick<Product, "name" | "unofficial">): string {
  // A compatible accessory is for Beyblade X, never sold as one.
  if (product.unofficial) return `${product.name} compatibile Beyblade X`;
  return /^beyblade/i.test(product.name) ? product.name : `Beyblade X ${product.name}`;
}

function clip(text: string): string {
  if (text.length <= DESCRIPTION_LIMIT) return text;
  const cut = text.slice(0, DESCRIPTION_LIMIT - 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

export function productDescription(
  product: Pick<Product, "name" | "tagline" | "price" | "stock" | "unofficial" | "releasePreorder">,
): string {
  const shipping = product.price.amount >= FREE_SHIPPING_THRESHOLD
      ? "spedizione gratuita"
      : `spedizione da ${SHIPPING_FLAT_LABEL}, gratis da ${FREE_SHIPPING_FROM_LABEL}`;
  return clip(`${productTitle(product)} a ${formatPrice(product.price)}, ${stockLabel(product).toLowerCase()}. ${product.tagline} Pagamento sicuro, ${shipping}.`);
}

const CATEGORY_TITLE: Readonly<Record<CategorySlug, string>> = {
  "beyblade-x": "Trottole Beyblade X",
  lanciatori: "Lanciatori Beyblade X",
  stadi: "Stadi Beyblade X",
  accessori: "Accessori Beyblade X",
};

export function categoryTitle(slug: CategorySlug): string {
  return CATEGORY_TITLE[slug];
}

/** Serialises JSON-LD for a <script> tag; `<` is escaped so text can never close the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Weekdays: when orders are packed and handed to the carrier. */
const BUSINESS_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const HANDLING_DAYS = { minValue: 0, maxValue: 1 } as const;
const TRANSIT_DAYS = { minValue: 1, maxValue: 4 } as const;
const days = (range: { readonly minValue: number; readonly maxValue: number }) => ({ "@type": "QuantitativeValue", ...range, unitCode: "DAY" });

/** Free returns within 30 days of delivery, by mail, refunded in full: the "Resi e rimborsi" page. */
const RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "IT",
  returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
  merchantReturnDays: RETURN_DAYS,
  returnMethod: "https://schema.org/ReturnByMail",
  returnFees: "https://schema.org/FreeReturn",
} as const;

const euros = (cents: number) => Number((cents / 100).toFixed(2));

/**
 * The shop's shipping policy, one service per carrier the checkout offers: its price below the
 * free-shipping threshold and nothing from it. Product pages repeat the rate for a single item,
 * which Google reads as the more specific of the two.
 */
function shippingServices() {
  const condition = (orderValue: { readonly minValue?: number; readonly maxValue?: number }, cents: number) => ({
    "@type": "ShippingConditions",
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "IT" },
    orderValue: { "@type": "MonetaryAmount", currency: "EUR", ...orderValue },
    shippingRate: { "@type": "MonetaryAmount", value: euros(cents), currency: "EUR" },
    transitTime: { "@type": "ServicePeriod", duration: days(TRANSIT_DAYS) },
  });
  return SHIPPING_METHODS.map((method) => ({
    "@type": "ShippingService",
    "@id": absoluteUrl(`/#shipping-${method.code}`),
    name: method.label,
    // An InPost point or Locker is where the courier leaves the parcel: there is no shop to collect from.
    fulfillmentType: method.pickupPoint
      ? "https://schema.org/FulfillmentTypeCollectionPoint"
      : "https://schema.org/FulfillmentTypeDelivery",
    handlingTime: { "@type": "ServicePeriod", duration: days(HANDLING_DAYS), businessDays: BUSINESS_DAYS },
    shippingConditions: [
      condition({ minValue: 0, maxValue: euros(FREE_SHIPPING_THRESHOLD - 1) }, method.priceCents),
      condition({ minValue: euros(FREE_SHIPPING_THRESHOLD) }, 0),
    ],
  }));
}

/**
 * The shop as Google's OnlineStore: it sells online only, with no premises customers visit, so it
 * carries no street address. The VAT number is the one already published in the footer and the
 * legal pages; the shipping and return policies are the ones the checkout applies.
 */
const organization = {
  "@type": "OnlineStore",
  "@id": absoluteUrl("/#organization"),
  name: SITE_NAME,
  alternateName: "GearDrop",
  url: PRODUCTION_ORIGIN,
  logo: { "@type": "ImageObject", url: absoluteUrl(brand.emblem512), width: 512, height: 512 },
  description: "Negozio online di Beyblade X in Italia: trottole, lanciatori e stadi originali, spediti con Poste Italiane e InPost.",
  email: SHOP_EMAIL,
  vatID: `IT${SELLER.vat}`,
  // Ties the shop's own profiles to this Organization, so a search engine treats them as one business
  // instead of three strangers that happen to share a name.
  sameAs: ["https://www.instagram.com/geardropshop/"],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer service",
    email: SHOP_EMAIL,
    availableLanguage: ["it"],
    areaServed: "IT",
  },
  hasMerchantReturnPolicy: { ...RETURN_POLICY, refundType: "https://schema.org/FullRefund" },
  hasShippingService: shippingServices(),
};

export function siteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      {
        "@type": "WebSite",
        "@id": absoluteUrl("/#website"),
        name: SITE_NAME,
        url: PRODUCTION_ORIGIN,
        inLanguage: "it-IT",
        publisher: { "@id": organization["@id"] },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl("/ricerca")}?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

/**
 * A catalogue page as a list of the products on it. The shop and its categories were the only pages
 * saying nothing about what they hold, so a crawler had to guess the listing from the markup.
 */
export function collectionJsonLd(
  name: string,
  path: string,
  products: readonly { readonly slug: string; readonly name: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": absoluteUrl(path),
    name,
    url: absoluteUrl(path),
    isPartOf: { "@id": absoluteUrl("/#website") },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: product.name,
        url: absoluteUrl(`/prodotto/${product.slug}`),
      })),
    },
  };
}

/**
 * The monthly meta tier list as a dated Article carrying its three rankings.
 *
 * `dateModified` is the point of it: "meta" is a question about now, and a page that can
 * show when it was last revised is the one a search engine can tell is still current.
 */
export function metaPageJsonLd(input: {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly datePublished: string | null;
  readonly dateModified: string;
  readonly rankings: readonly { readonly tier: string; readonly pieces: readonly string[] }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": absoluteUrl(input.path),
    url: absoluteUrl(input.path),
    headline: input.title,
    description: input.description,
    inLanguage: "it-IT",
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    dateModified: input.dateModified,
    author: { "@id": absoluteUrl("/#organization") },
    publisher: { "@id": absoluteUrl("/#organization") },
    isPartOf: { "@id": absoluteUrl("/#website") },
    hasPart: input.rankings.map((ranking) => ({
      "@type": "ItemList",
      name: ranking.tier,
      numberOfItems: ranking.pieces.length,
      itemListElement: ranking.pieces.map((piece, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: piece,
      })),
    })),
  };
}

export function breadcrumbJsonLd(items: readonly { readonly name: string; readonly path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

const AVAILABILITY = {
  disponibile: "https://schema.org/InStock",
  "in-arrivo": "https://schema.org/BackOrder",
  "pre-ordine": "https://schema.org/PreOrder",
  esaurito: "https://schema.org/OutOfStock",
} as const;

export function productJsonLd(product: Product) {
  const url = absoluteUrl(`/prodotto/${product.slug}`);
  const free = product.price.amount >= FREE_SHIPPING_THRESHOLD;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.name,
    description: product.description,
    url,
    sku: product.slug.toUpperCase(),
    image: product.images.map((image) => absoluteUrl(image.src)),
    category: CATEGORY_LABEL[product.category],
    // A compatible accessory carries no Hasbro brand, and the shop never claims one for it.
    ...(product.unofficial ? {} : { brand: { "@type": "Brand", name: "Hasbro" } }),
    ...(product.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
          },
        }
      : {}),
    offers: {
      "@type": "Offer",
      url,
      price: (product.price.amount / 100).toFixed(2),
      priceCurrency: product.price.currency,
      availability: AVAILABILITY[product.stock],
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: SITE_NAME, url: PRODUCTION_ORIGIN },
      // One entry per carrier the checkout offers (Poste, InPost to a point, InPost to the door).
      shippingDetails: SHIPPING_METHODS.map((method) => ({
        "@type": "OfferShippingDetails",
        shippingLabel: method.label,
        shippingRate: { "@type": "MonetaryAmount", value: ((free ? 0 : method.priceCents) / 100).toFixed(2), currency: "EUR" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "IT" },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          businessDays: { "@type": "OpeningHoursSpecification", dayOfWeek: BUSINESS_DAYS },
          handlingTime: days(HANDLING_DAYS),
          transitTime: days(TRANSIT_DAYS),
        },
      })),
      hasMerchantReturnPolicy: RETURN_POLICY,
    },
  };
}
