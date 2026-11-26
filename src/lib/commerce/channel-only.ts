import type { Product } from "./types";

/**
 * A product whose pre-order is taken on the Telegram channel (Product.channelOnly), as the shop
 * itself treats it. Two ways, both the owner's (2026-11-26):
 *
 * - kept out of the shop until its pieces arrive (`true`): "caricati sul sito ma nascosti finché
 *   poi effettivamente in magazzino";
 * - on the shop with "Avvisami", while the pieces he set aside are pre-ordered on the channel
 *   (`"avvisami"`): "mettili sul sito con avvisami e solo 8 in pre order per telegram". The
 *   shop says "In arrivo", not "Esaurito": "sul sito devi mettere «in arrivo»".
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
 * pre-orders cannot be bought there: its `stock` reads "esaurito", with nothing to count, so every
 * card, page and button offers "Avvisami" instead of the cart. What the shopper is told is another
 * matter: see isArriving().
 */
export function shopView(product: Product): Product {
  if (product.channelOnly !== "avvisami" || product.stock === "esaurito") return product;
  return { ...product, stock: "esaurito", availableQuantity: 0 };
}

/**
 * On its way: the shop cannot sell it yet and its pre-order is on Telegram. The shopper reads
 * "In arrivo" (the label, the colour, the filter), never "Esaurito"; whether it can be bought is
 * still decided by `stock`.
 */
export function isArriving(product: Pick<Product, "stock" | "channelOnly">): boolean {
  return product.stock === "esaurito" && product.channelOnly === "avvisami";
}
