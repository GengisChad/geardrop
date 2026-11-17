/**
 * The newsletter the owner asked for on 2026-11-13: news on stock and arrivals, signed up from a
 * banner on the home ("Questo è solo il primo drop, iscriviti per le novità").
 *
 * Pure rules shared by the banner, the server actions and the tests.
 */

/** The banner's headline, in the owner's words. */
export const NEWSLETTER_HEADLINE = "Questo è solo il primo drop, iscriviti per le novità";

/** The promise printed under the form. It is what the visitor agrees to, so it is stored as the consent. */
export const NEWSLETTER_PROMISE = "Solo email su arrivi e riassortimenti. Ti cancelli quando vuoi.";

/** What the database keeps as proof of consent: where it was given, and the words the visitor read. */
export const NEWSLETTER_CONSENT_TEXT = `Banner della home: «${NEWSLETTER_HEADLINE}». ${NEWSLETTER_PROMISE} Informativa: /legale/privacy`;

/** Where the banner remembers what the visitor did with it. */
export const NEWSLETTER_STORAGE_KEY = "gd-newsletter";

/** Closed without signing up, the banner stays away this long. */
export const NEWSLETTER_SNOOZE_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Whether the banner should open, from what this browser stored: nothing yet, a close
 * (`closed:<ms>`), or a signup (`joined`). Anything unreadable counts as nothing.
 */
export function newsletterBannerDue(stored: string | null, now: number): boolean {
  if (!stored) return true;
  if (stored === "joined") return false;
  const closedAt = Number(stored.startsWith("closed:") ? stored.slice("closed:".length) : Number.NaN);
  if (!Number.isFinite(closedAt)) return true;
  return now - closedAt >= NEWSLETTER_SNOOZE_DAYS * DAY_MS;
}

/** The confirm and unsubscribe links carry the row's token. */
export function isNewsletterToken(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export function newsletterConfirmUrl(origin: string, token: string): string {
  return `${origin}/newsletter/conferma?t=${encodeURIComponent(token)}`;
}

export function newsletterUnsubscribeUrl(origin: string, token: string): string {
  return `${origin}/newsletter/disiscriviti?t=${encodeURIComponent(token)}`;
}
