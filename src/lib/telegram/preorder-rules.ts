import { FREE_SHIPPING_THRESHOLD, shippingMethodsFor } from "@/data/catalog";
import type { Product } from "@/lib/commerce/types";

/**
 * The rules of a pre-order taken on Telegram (owner, 2026-11-26): the piece is in the catalogue
 * but not in the shop (Product.channelOnly), the buyer reserves it in the bot's chat and pays at
 * once, the piece and its shipping together, with PayPal.me or through the site's checkout.
 *
 * Pure rules shared by the bot, the cart link and the tests. Every amount is worked out here from
 * the product the shop serves and from the catalogue's own shipping methods, never typed.
 */

/** Pieces one buyer may reserve at a time, so a short drop reaches more than a few people. */
export const MAX_PREORDER_PIECES = 3;

/** How long reserved pieces wait for a PayPal.me payment before going back to the others. */
export const HOLD_HOURS = 24;

/** A pre-order someone can take right now. */
export function preorderOpen(product: Product | undefined | null): product is Product {
  return Boolean(product?.channelOnly) && product!.stock !== "esaurito";
}

/** How many pieces the bot offers one buyer: what is left, up to the limit per buyer. */
export function piecesOffered(product: Pick<Product, "availableQuantity">): number {
  const left = product.availableQuantity ?? MAX_PREORDER_PIECES;
  return Math.max(0, Math.min(MAX_PREORDER_PIECES, left));
}

export type PreorderTotals = {
  readonly unitCents: number;
  readonly shippingCents: number;
  readonly totalCents: number;
  readonly shippingLabel: string;
};

/**
 * What a pre-order costs, shipping included, or null when the piece does not travel to an InPost
 * Locker (a stadium box, a partner's piece): the bot's chat only knows how to ask for a Locker, so
 * those go through the site's checkout, which knows every route.
 */
export function preorderTotals(product: Product, quantity: number): PreorderTotals | null {
  const method = shippingMethodsFor(product)[0];
  if (!method || method.carrier !== "inpost" || !method.pickupPoint) return null;
  const pieces = product.price.amount * quantity;
  const shippingCents = pieces >= FREE_SHIPPING_THRESHOLD ? 0 : method.priceCents;
  return { unitCents: product.price.amount, shippingCents, totalCents: pieces + shippingCents, shippingLabel: method.label };
}

/** A PayPal.me name: letters and digits, as PayPal issues them. */
export function isPaypalHandle(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[A-Za-z0-9]{3,20}$/.test(value);
}

/** The PayPal.me address that asks for exactly this amount in euro. */
export function paypalMeUrl(handle: string, totalCents: number): string {
  return `https://paypal.me/${handle}/${(totalCents / 100).toFixed(2)}EUR`;
}

/** No 0/O, 1/I/L: the buyer copies the code into PayPal's note by hand. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** "GDT-7K3Q9A": what ties a PayPal payment to its pre-order. `random` gives numbers in [0, 1). */
export function newPreorderCode(random: () => number = Math.random): string {
  let code = "";
  for (let index = 0; index < 6; index += 1) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return `GDT-${code}`;
}

/** The channel post's button opens the bot with this after /start. Telegram allows 64 characters. */
export function startPayload(slug: string): string | null {
  const payload = `pre-${slug}`;
  return /^[A-Za-z0-9_-]{1,64}$/.test(payload) ? payload : null;
}

/** "/start pre-cobalt-drake-4-60f" → the slug. */
export function slugFromStart(text: string): string | null {
  return /^\/start(?:@\w+)?\s+pre-([a-z0-9-]{1,60})$/i.exec(text.trim())?.[1]?.toLowerCase() ?? null;
}

/**
 * "?preordine=<slug>&q=2", the address the bot's "paga sul sito" button opens the cart with. Only
 * the shape is checked here: whether the piece exists, what it costs and how many are left is the
 * server's quote to say.
 */
export function preorderFromCartLink(search: string): { readonly slug: string; readonly quantity: number } | null {
  const params = new URLSearchParams(search);
  const slug = params.get("preordine") ?? "";
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const quantity = Math.trunc(Number(params.get("q") ?? "1"));
  return { slug, quantity: Number.isFinite(quantity) ? Math.min(MAX_PREORDER_PIECES, Math.max(1, quantity)) : 1 };
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** A first name and a surname, as the parcel's label needs them. */
export function parseBuyerName(text: string): string | null {
  const name = clean(text);
  return name.length >= 5 && name.length <= 80 && /^[\p{L}][\p{L}' .-]*\s[\p{L}' .-]*[\p{L}.]$/u.test(name) ? name : null;
}

export function parseEmail(text: string): string | null {
  const email = clean(text).toLowerCase();
  return email.length <= 320 && /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,63}$/.test(email) ? email : null;
}

/** An Italian mobile number, with or without +39: InPost texts the pick-up code to it. */
export function parsePhone(text: string): string | null {
  const digits = text.replace(/[\s./()-]/g, "").replace(/^(\+39|0039)/, "");
  return /^3\d{8,9}$/.test(digits) ? `+39${digits}` : null;
}

export function parsePostalCode(text: string): string | null {
  const cap = clean(text);
  return /^\d{5}$/.test(cap) ? cap : null;
}
