import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Resend inbound email, without the SDK (the shop talks to Resend over REST, see
 * src/lib/email/resend.ts).
 *
 * Resend signs every webhook the Svix way: HMAC-SHA256 over "<svix-id>.<svix-timestamp>.<raw body>"
 * with the base64 part of the "whsec_…" secret, sent as space-separated "v1,<base64>" entries in
 * svix-signature. The webhook carries metadata only; the body is fetched by id with the API key.
 */

/** Five minutes either way, Svix's own tolerance: an older signature is a replay. */
const TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = {
  readonly id: string | null;
  readonly timestamp: string | null;
  readonly signature: string | null;
};

export function verifySvixSignature(
  payload: string,
  headers: SvixHeaders,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.trim().replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest();

  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type ReceivedEmailEvent = { readonly type: string; readonly emailId: string | null };

export function parseReceivedEvent(payload: string): ReceivedEmailEvent | null {
  try {
    const event = JSON.parse(payload) as { type?: unknown; data?: { email_id?: unknown } };
    if (typeof event.type !== "string") return null;
    const emailId = typeof event.data?.email_id === "string" ? event.data.email_id : null;
    return { type: event.type, emailId };
  } catch {
    return null;
  }
}

export type ReceivedEmail = {
  readonly id: string;
  readonly from: string;
  readonly subject: string;
  readonly text: string | null;
  readonly html: string | null;
  /** DMARC passed: the From domain signed the email, so it was not merely made to look like it. */
  readonly senderVerified: boolean;
  readonly createdAt: string | null;
};

/** GET /emails/receiving/{id}: the body, headers and authentication results of one email. */
export async function fetchReceivedEmail(
  emailId: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<ReceivedEmail> {
  const response = await fetcher(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`resend receiving ${response.status}`);
  const email = (await response.json()) as {
    id?: unknown; from?: unknown; subject?: unknown; text?: unknown; html?: unknown; created_at?: unknown;
    authentication?: { dmarc?: unknown } | null;
  };
  return {
    id: typeof email.id === "string" ? email.id : emailId,
    from: typeof email.from === "string" ? email.from : "",
    subject: typeof email.subject === "string" ? email.subject : "",
    text: typeof email.text === "string" ? email.text : null,
    html: typeof email.html === "string" ? email.html : null,
    senderVerified: email.authentication?.dmarc === "pass",
    createdAt: typeof email.created_at === "string" ? email.created_at : null,
  };
}

/**
 * Only Vinted's own sender counts as a sale. Gmail's automatic forwarding keeps the original
 * From and Vinted's DKIM signature, so DMARC still passes for vinted.it — which is what lets the
 * shop act on it alone; an email that merely says it is from Vinted is stored and left for the owner.
 */
export function isFromVinted(from: string): boolean {
  // The mailbox is the one address of the header: in angle brackets after a display name, or the
  // whole header. A display name that merely contains a Vinted address does not count.
  const trimmed = from.trim();
  const bracketed = /^[^<>]*<([^<>\s]+)>$/.exec(trimmed);
  const mailbox = bracketed ? bracketed[1]! : /^[^<>\s]+$/.test(trimmed) ? trimmed : null;
  return mailbox !== null && /^[^@\s]+@vinted\.(it|com|fr|es|de|co\.uk)$/i.test(mailbox);
}
