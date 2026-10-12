import type { MetadataRoute } from "next";
import { BRANDS, BUNDLES, CATEGORIES, PRODUCTS, brandOf } from "@/data/catalog";
import { LEGAL_PAGES, SUPPORT_PAGES } from "@/data/pages";
import { oneCardPerFamily } from "@/lib/commerce/variants";
import { absoluteUrl } from "@/lib/seo";
import { getStorefrontMetaArchive } from "@/lib/storefront/meta-repository";

/**
 * /sitemap.xml: every page a shopper can land on from Google. Cart, checkout, account and
 * search stay out; they are noindex or behind a login.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  // Every meta month the owner has published keeps its own entry: an archived tier list
  // is the long tail of a question that gets asked again every season.
  //
  // Swallowed on purpose: the sitemap is how every other page gets crawled, and losing
  // the whole file because one table is unreachable costs far more than losing the meta
  // months from it for one fetch.
  const metaMonths = await getStorefrontMetaArchive().catch(() => []);
  const hasTakaraProducts = PRODUCTS.some((p) => brandOf(p) === "takara-tomy");

  return [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/negozio"), lastModified, changeFrequency: "daily", priority: 0.9 },
    // Hasbro brand page is always listed; Takara Tomy only when the catalogue has those products.
    ...BRANDS.filter((b) => b.slug === "hasbro" || hasTakaraProducts).map((brandDef) => ({
      url: absoluteUrl(`/negozio/${brandDef.slug}`),
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...CATEGORIES.map((category) => ({
      url: absoluteUrl(`/negozio/${category.slug}`),
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    // An item sold in several colours is listed once: its other colours point here as canonical.
    ...oneCardPerFamily([...BUNDLES, ...PRODUCTS]).map((product) => ({
      url: absoluteUrl(`/prodotto/${product.slug}`),
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.9,
      images: product.images.map((image) => absoluteUrl(image.src)),
    })),
    { url: absoluteUrl("/meta"), lastModified, changeFrequency: "monthly", priority: 0.7 },
    ...metaMonths.map((month) => ({
      url: absoluteUrl(`/meta/${month.month}`),
      lastModified: new Date(month.updatedAt),
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
    { url: absoluteUrl("/chi-siamo"), lastModified, changeFrequency: "monthly", priority: 0.5 },
    ...Object.keys(SUPPORT_PAGES).map((slug) => ({
      url: absoluteUrl(`/assistenza/${slug}`),
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
    ...Object.keys(LEGAL_PAGES).map((slug) => ({
      url: absoluteUrl(`/legale/${slug}`),
      lastModified,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
