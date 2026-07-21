/**
 * The canonical Production origin. Metadata, canonical links and Open Graph URLs are
 * absolute against this, so they stay correct no matter which host served the page.
 */
export const PRODUCTION_ORIGIN = "https://geardropshop.it";

/**
 * Where Supabase should send the user back after an email link.
 *
 * Auth emails are built from the origin that requested them, not from the canonical one:
 * a confirmation opened from a Preview deployment has to return to that same Preview, and
 * a local sign-up has to return to localhost. Falling back to the canonical origin keeps
 * the link valid when no request origin is available.
 *
 * Every origin used here must also be listed in the project's Supabase redirect allow
 * list, otherwise Auth refuses the redirect and drops the user on the Site URL instead.
 */
export function authRedirectUrl(requestOrigin: string | null, path: string): string {
  const base = requestOrigin && /^https?:\/\//.test(requestOrigin) ? requestOrigin : PRODUCTION_ORIGIN;

  return new URL(path, base).toString();
}

/**
 * Guards the `next` parameter carried through sign-in and the email callback. Only
 * same-site absolute paths survive: anything protocol-relative, absolute or otherwise
 * off-site collapses to the account page, so a crafted link cannot bounce a freshly
 * authenticated visitor to another host.
 */
export function safeRedirectPath(candidate: string | null | undefined, fallback = "/account"): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//")) return fallback;

  return candidate;
}
