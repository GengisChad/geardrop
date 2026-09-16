/**
 * Transactional email through Resend's REST API, without the SDK.
 *
 * RESEND_API_KEY enables sending. ORDER_EMAIL_FROM is the sender: until the shop's domain is
 * verified on Resend it stays on Resend's shared address, which can only deliver to the email
 * the Resend account was created with — enough for the owner's order notifications.
 */

type Env = Readonly<Record<string, string | undefined>>;

export const DEFAULT_EMAIL_FROM = "GEAR//DROP Ordini <onboarding@resend.dev>";
export const SHOP_EMAIL = "infogeardrop@gmail.com";

export type EmailMessage = {
  readonly to: string | readonly string[];
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly replyTo?: string;
  /** Resend drops a second request with the same key, so a retried webhook never mails twice. */
  readonly idempotencyKey?: string;
};

export type EmailResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: "not_configured" | "rejected"; readonly detail?: string };

export function emailConfigured(env: Env = process.env): boolean {
  return Boolean(env["RESEND_API_KEY"]?.trim());
}

/** Where order notifications go: the shop inbox unless ORDER_NOTIFICATION_EMAIL names another. */
export function orderNotificationRecipient(env: Env = process.env): string {
  return env["ORDER_NOTIFICATION_EMAIL"]?.trim() || SHOP_EMAIL;
}

export async function sendEmail(
  message: EmailMessage,
  env: Env = process.env,
  fetcher: typeof fetch = fetch,
): Promise<EmailResult> {
  const apiKey = env["RESEND_API_KEY"]?.trim();
  if (!apiKey) return { ok: false, reason: "not_configured" };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (message.idempotencyKey) headers["Idempotency-Key"] = message.idempotencyKey;

  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({
      from: env["ORDER_EMAIL_FROM"]?.trim() || DEFAULT_EMAIL_FROM,
      to: typeof message.to === "string" ? [message.to] : [...message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as { readonly id?: string; readonly message?: string };
  if (!response.ok || typeof payload.id !== "string") {
    return { ok: false, reason: "rejected", detail: `${response.status} ${payload.message ?? ""}`.trim() };
  }
  return { ok: true, id: payload.id };
}
