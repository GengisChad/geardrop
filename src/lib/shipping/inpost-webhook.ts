import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * InPost signs every webhook call with HMAC-SHA256 over the raw body, or over
 * "<x-inpost-timestamp>.<body>" (the subscription decides which), Base64 in x-inpost-signature.
 * https://developers.inpost-group.com/webhook-signature-verification
 *
 * Both forms are accepted, so the check holds whichever one InPost set up for the shop.
 */
export function inpostSignatureValid(rawBody: string, signature: string | null, timestamp: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const given = Buffer.from(signature.trim());
  const contents = timestamp ? [rawBody, `${timestamp}.${rawBody}`] : [rawBody];
  return contents.some((content) => {
    const expected = Buffer.from(createHmac("sha256", secret).update(content, "utf8").digest("base64"));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

export type InpostWebhookEvent = { readonly trackingNumber: string; readonly eventCode: string; readonly timestamp: string };

/** The fields the shop acts on, or null for a payload it does not recognise. */
export function parseInpostWebhook(rawBody: string): InpostWebhookEvent | null {
  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const { trackingNumber, eventCode, timestamp } = payload;
    if (typeof trackingNumber !== "string" || typeof eventCode !== "string" || typeof timestamp !== "string") return null;
    return { trackingNumber, eventCode, timestamp };
  } catch {
    return null;
  }
}
