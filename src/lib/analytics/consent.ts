/**
 * The visitor's cookie choice, kept in their browser.
 *
 * Google Analytics sets cookies that are not technically necessary, so under the Italian
 * Garante's cookie guidelines it may only load after an explicit "Accetta"; closing the banner
 * or refusing keeps it off, and the banner is not shown again for six months unless the choice
 * is reopened from "Gestisci cookie" in the footer. Vercel Web Analytics is cookieless and runs
 * regardless.
 */

export const CONSENT_STORAGE_KEY = "gd-cookie-consent";
/** Bump when what the banner asks for changes: every visitor is asked again. */
export const CONSENT_VERSION = 1;
/** The Garante: a refusal must not be asked again for at least six months. */
export const CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
/** Fired on window when the footer asks to reopen the banner. */
export const OPEN_CONSENT_EVENT = "gd:open-cookie-consent";

export type ConsentChoice = { readonly analytics: boolean; readonly at: string; readonly version: number };

type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): KeyValueStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The stored choice, or null when there is none, it is unreadable, outdated or older than six months. */
export function readConsent(storage: KeyValueStore | null = browserStorage(), now: number = Date.now()): ConsentChoice | null {
  try {
    const raw = storage?.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentChoice>;
    if (typeof parsed.analytics !== "boolean" || typeof parsed.at !== "string" || parsed.version !== CONSENT_VERSION) return null;
    const at = Date.parse(parsed.at);
    if (!Number.isFinite(at) || now - at > CONSENT_MAX_AGE_MS || at - now > 60_000) return null;
    return { analytics: parsed.analytics, at: parsed.at, version: parsed.version };
  } catch {
    return null;
  }
}

/** Stores the choice; in a browser that refuses storage the choice holds for this page only. */
export function writeConsent(analytics: boolean, storage: KeyValueStore | null = browserStorage(), now: number = Date.now()): ConsentChoice {
  const choice: ConsentChoice = { analytics, at: new Date(now).toISOString(), version: CONSENT_VERSION };
  try {
    storage?.setItem(CONSENT_STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Private mode or blocked storage: nothing to persist, the banner asks again next visit.
  }
  return choice;
}

/** The Google Analytics cookies to clear when consent is withdrawn (_ga and _ga_<container>). */
export function analyticsCookieNames(cookieHeader: string): readonly string[] {
  return cookieHeader
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter((name) => name === "_ga" || name.startsWith("_ga_") || name === "_gid");
}
