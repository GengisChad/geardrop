import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe webhook signature check, without the Stripe SDK.
 *
 * Stripe signs `<timestamp>.<raw body>` with the endpoint's signing secret and sends
 * `Stripe-Signature: t=<timestamp>,v1=<hex>[,v1=<hex>…]`. A delivery is genuine when one v1
 * matches and the timestamp is recent, which also stops an old delivery being replayed.
 */

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export type StripeEvent = {
  readonly id: string;
  readonly type: string;
  readonly data: { readonly object: { readonly id?: string; readonly object?: string } };
};

export function stripeSignature(payload: string, secret: string, timestamp: number): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
}

export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!header || !secret) return false;

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2).map((item) => item.trim());
    if (key === "t" && value && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === "v1" && value && /^[0-9a-f]{64}$/.test(value)) signatures.push(value);
  }
  if (timestamp === null || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = Buffer.from(stripeSignature(payload, secret, timestamp), "hex");
  return signatures.some((signature) => {
    const candidate = Buffer.from(signature, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

/** Parses a verified payload; anything that is not a Stripe event shape comes back null. */
export function parseStripeEvent(payload: string): StripeEvent | null {
  try {
    const value = JSON.parse(payload) as Partial<StripeEvent>;
    if (typeof value.id !== "string" || typeof value.type !== "string" || typeof value.data?.object !== "object") return null;
    return value as StripeEvent;
  } catch {
    return null;
  }
}
