/**
 * The link of a product's «Avvisami su Telegram» button: it opens the shop's bot with the product.
 * Kept free of imports, because the product page's form (a client component) builds it.
 */
export const TELEGRAM_BOT_URL = "https://t.me/GearDropNewsBot";

/** The /start payload for a product, or null when it would not fit Telegram's 64 characters. */
export function restockStartPayload(slug: string): string | null {
  const payload = `av-${slug}`;
  return /^[A-Za-z0-9_-]{1,64}$/.test(payload) ? payload : null;
}

export function restockTelegramUrl(slug: string): string | null {
  const payload = restockStartPayload(slug);
  return payload ? `${TELEGRAM_BOT_URL}?start=${payload}` : null;
}
