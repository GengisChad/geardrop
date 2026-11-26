import type { Product } from "./types";

/**
 * A product whose pre-order is taken on the Telegram channel (Product.channelOnly), as the shop
 * itself treats it. Two ways, both the owner's (2026-11-26):
 *
 * - kept out of the shop until its pieces arrive (`true`): "caricati sul sito ma nascosti finché
 *   poi effettivamente in magazzino";
 * - on the shop as a sold-out product with "Avvisami", while the pieces he set aside are
 *   pre-ordered on the channel (`"avvisami"`): "mettili sul sito con avvisami e solo 8 in pre
 *   order per telegram".
 *
 * Either way the cart prices the product as it really is (the provider's quote never goes through
 * here), so the cart the channel's post opens can sell the pieces set aside.
 */

/** In no list, search, sitemap or feed of the shop: only its own link opens its page. */
export function hiddenFromShop(product: Pick<Product, "channelOnly">): boolean {
  return product.channelOnly === true;
}

/**
 * The product as the shop's own pages show it. One the shop lists while Telegram takes its
 * pre-orders reads sold out, with nothing to count, so its card and its page offer "Avvisami".
 */
export function shopView(product: Product): Product {
  if (product.channelOnly !== "avvisami" || product.stock === "esaurito") return product;
  return { ...product, stock: "esaurito", availableQuantity: 0 };
}
