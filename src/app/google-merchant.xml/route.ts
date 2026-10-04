import { BUNDLES, FREE_SHIPPING_THRESHOLD, PRODUCTS, SHIPPING_FLAT_RATE } from "@/data/catalog";
import { getCommerceProvider } from "@/lib/commerce/provider";
import type { Product } from "@/lib/commerce/types";
import { CATEGORY_LABEL } from "@/lib/labels";
import { absoluteUrl, productTitle, SITE_NAME } from "@/lib/seo";

/**
 * /google-merchant.xml: the catalogue as a Google Merchant Center feed, so Shopping reads the
 * same prices, stock and shipping the shop charges instead of a spreadsheet that drifts.
 *
 * Every colour of an item sold in several is its own offer sharing an item_group_id — a shopper
 * buys one colour, so Shopping has to be able to show one. Stock comes from the provider, which
 * overlays the live figures on the catalogue, because an offer Google believes is in stock and
 * the shop cannot ship is the one mistake that gets a feed suspended.
 */

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const AVAILABILITY: Record<Product["stock"], string> = {
  disponibile: "in_stock",
  // Google's "preorder" wants a firm release date, which a distributor rarely gives us.
  // "backorder" says the same thing honestly: orderable now, ships later.
  "in-arrivo": "backorder",
  "pre-ordine": "backorder",
  esaurito: "out_of_stock",
};

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const euro = (cents: number) => `${(cents / 100).toFixed(2)} EUR`;

function offer(product: Product): string {
  const rows: string[] = [
    `<g:id>${escape(product.slug)}</g:id>`,
    `<g:title>${escape(productTitle(product))}</g:title>`,
    `<g:description>${escape(product.description)}</g:description>`,
    `<g:link>${escape(absoluteUrl(`/prodotto/${product.slug}`))}</g:link>`,
    `<g:condition>new</g:condition>`,
    `<g:availability>${AVAILABILITY[product.stock]}</g:availability>`,
    `<g:brand>${escape(product.unofficial ? SITE_NAME : "Hasbro")}</g:brand>`,
    `<g:product_type>${escape(CATEGORY_LABEL[product.category])}</g:product_type>`,
  ];

  const [first, ...rest] = product.images;
  if (first) rows.push(`<g:image_link>${escape(absoluteUrl(first.src))}</g:image_link>`);
  for (const image of rest.slice(0, 10)) {
    rows.push(`<g:additional_image_link>${escape(absoluteUrl(image.src))}</g:additional_image_link>`);
  }

  // A discounted item lists its full price and the price actually charged, the way the card reads.
  if (product.compareAtPrice) {
    rows.push(`<g:price>${euro(product.compareAtPrice.amount)}</g:price>`);
    rows.push(`<g:sale_price>${euro(product.price.amount)}</g:sale_price>`);
  } else {
    rows.push(`<g:price>${euro(product.price.amount)}</g:price>`);
  }

  // Only the deck cases are ours and genuinely have no barcode. Hasbro boxes do have one; until
  // those are recorded we say nothing rather than claim an identifier does not exist.
  if (product.unofficial) rows.push(`<g:identifier_exists>no</g:identifier_exists>`);

  if (product.variant) {
    rows.push(`<g:item_group_id>${escape(product.variant.family)}</g:item_group_id>`);
    rows.push(`<g:color>${escape(product.variant.label)}</g:color>`);
  }

  const shipping = product.price.amount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT_RATE;
  rows.push(
    `<g:shipping><g:country>IT</g:country><g:service>Standard</g:service><g:price>${euro(shipping)}</g:price></g:shipping>`,
  );

  return `<item>${rows.join("")}</item>`;
}

export async function GET(): Promise<Response> {
  const commerce = await getCommerceProvider();
  const slugs = [...BUNDLES, ...PRODUCTS].map((product) => product.slug);
  const products = await commerce.getProductsBySlugs(slugs);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${escape(SITE_NAME)}</title>
<link>${escape(absoluteUrl("/"))}</link>
<description>Catalogo Beyblade X di ${escape(SITE_NAME)}</description>
${products.map(offer).join("\n")}
</channel>
</rss>`;

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // Merchant Center refetches on its own schedule; a short cache keeps a crawl burst cheap
      // without letting a sold-out item linger.
      "cache-control": "public, max-age=600, s-maxage=600",
    },
  });
}
