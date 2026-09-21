import { FREE_SHIPPING_THRESHOLD, SHIPPING_FLAT_RATE } from "@/data/catalog";
import { brand } from "@/data/assets";
import { SHOP_EMAIL } from "@/lib/email/resend";
import { formatPrice } from "@/lib/format";
import { CATEGORY_LABEL, STOCK_LABEL } from "@/lib/labels";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import type { CategorySlug, Product } from "@/lib/commerce/types";

/**
 * Search metadata and schema.org data, derived from the catalogue so prices, stock and
 * policies in Google's results always match what the page shows.
 */

export const SITE_NAME = "GEAR//DROP";
export const DEFAULT_TITLE = "GEAR//DROP · Negozio Beyblade X in Italia";
export const DEFAULT_DESCRIPTION =
  "Negozio online di Beyblade X in Italia: trottole, starter, lanciatori e stadi disponibili. Pagamento sicuro con Stripe, spedizione €4,90, gratis da €59.";

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

export function productDescription(product: Pick<Product, "name" | "tagline" | "price" | "stock" | "unofficial">): string {
  const shipping = product.price.amount >= FREE_SHIPPING_THRESHOLD ? "spedizione gratuita" : "spedizione €4,90, gratis da €59";
  return clip(`${productTitle(product)} a ${formatPrice(product.price)}, ${STOCK_LABEL[product.stock].toLowerCase()}. ${product.tagline} Pagamento sicuro, ${shipping}.`);
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

const organization = {
  "@type": "Organization",
  "@id": absoluteUrl("/#organization"),
  name: SITE_NAME,
  url: PRODUCTION_ORIGIN,
  logo: absoluteUrl(brand.emblem512),
  email: SHOP_EMAIL,
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer service",
    email: SHOP_EMAIL,
    availableLanguage: ["it"],
    areaServed: "IT",
  },
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
  const shippingCents = product.price.amount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT_RATE;
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
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: (shippingCents / 100).toFixed(2), currency: "EUR" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "IT" },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          businessDays: {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          },
          handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
          transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 4, unitCode: "DAY" },
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "IT",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: RETURN_DAYS,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/FreeReturn",
      },
    },
  };
}
