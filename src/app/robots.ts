import type { MetadataRoute } from "next";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import { absoluteUrl } from "@/lib/seo";

/**
 * /robots.txt. Only production is crawlable: preview deployments would otherwise compete
 * with the real shop in search results. Pages marked noindex (login, search, wishlist) stay
 * crawlable so Google can read that instruction.
 */
export default function robots(): MetadataRoute.Robots {
  if (process.env["VERCEL_ENV"] && process.env["VERCEL_ENV"] !== "production") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/account", "/auth/", "/carrello", "/checkout"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: PRODUCTION_ORIGIN,
  };
}
