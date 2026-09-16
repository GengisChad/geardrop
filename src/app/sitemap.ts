import type { MetadataRoute } from "next";
import { CATEGORIES, PRODUCTS } from "@/data/catalog";
import { LEGAL_PAGES, SUPPORT_PAGES } from "@/data/pages";
import { absoluteUrl } from "@/lib/seo";

/**
 * /sitemap.xml: every page a shopper can land on from Google. Cart, checkout, account and
 * search stay out; they are noindex or behind a login.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/negozio"), lastModified, changeFrequency: "daily", priority: 0.9 },
    ...CATEGORIES.map((category) => ({
      url: absoluteUrl(`/negozio/${category.slug}`),
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...PRODUCTS.map((product) => ({
      url: absoluteUrl(`/prodotto/${product.slug}`),
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.9,
      images: product.images.map((image) => absoluteUrl(image.src)),
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
