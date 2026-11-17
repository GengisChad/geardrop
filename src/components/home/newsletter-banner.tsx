"use client";

import Link from "next/link";
import { useActionState, useCallback, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { type NewsletterState, subscribeNewsletterAction } from "@/app/actions/newsletter";
import { Button } from "@/components/ui/button";
import { CONSENT_CHANGED_EVENT, readConsent } from "@/lib/analytics/consent";
import { NEWSLETTER_PROMISE, NEWSLETTER_STORAGE_KEY, newsletterBannerDue } from "@/lib/newsletter/newsletter";

/** What the visitor did with the banner, when the browser will not store it: kept for the visit. */
let visitMemory: string | null = null;
/** A cookie choice made in this tab where storage is blocked still counts as made. */
let consentSeenThisVisit = false;

function readStored(): string | null {
  try {
    return window.localStorage.getItem(NEWSLETTER_STORAGE_KEY) ?? visitMemory;
  } catch {
    return visitMemory;
  }
}

function remember(value: string) {
  visitMemory = value;
  try {
    window.localStorage.setItem(NEWSLETTER_STORAGE_KEY, value);
  } catch {
    // Blocked storage: the visit still remembers.
  }
}

const noSubscription = () => () => {};

function subscribeConsent(onChange: () => void) {
  const changed = () => {
    consentSeenThisVisit = true;
    onChange();
  };
  window.addEventListener(CONSENT_CHANGED_EVENT, changed);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CONSENT_CHANGED_EVENT, changed);
    window.removeEventListener("storage", onChange);
  };
}

const INITIAL: NewsletterState = { ok: false, message: "" };

/**
 * The newsletter ask the owner wants as the shop opens (2026-11-13), in the look he picked: a violet
 * bar docked at the bottom, violet being "on its way" across the shop. The page under it stays usable,
 * and closed it leaves the promotions and bundles as the first thing on the page.
 *
 * It opens on the home, on the live site, once the cookie question is answered (never two boxes at
 * once). Closed, it stays away for 30 days; after a signup, for good. `?iscriviti=1` opens it anywhere
 * the home runs, for a look or a test. It renders in the browser only, so it never holds up the first paint.
 */
export function NewsletterBanner({ enabled, cookieBanner }: { readonly enabled: boolean; readonly cookieBanner: boolean }) {
  const forced = useSyncExternalStore(noSubscription, () => new URLSearchParams(window.location.search).get("iscriviti") === "1", () => false);
  const due = useSyncExternalStore(noSubscription, () => newsletterBannerDue(readStored(), Date.now()), () => false);
  const consentAnswered = useSyncExternalStore(
    subscribeConsent,
    () => !cookieBanner || consentSeenThisVisit || readConsent() !== null,
    () => false,
  );
  const [closed, setClosed] = useState(false);
  const [state, formAction, pending] = useActionState(async (previous: NewsletterState, formData: FormData) => {
    const result = await subscribeNewsletterAction(previous, formData);
    if (result.ok) remember("joined");
    return result;
  }, INITIAL);

  const close = useCallback(() => {
    if (readStored() !== "joined") remember(`closed:${Date.now()}`);
    setClosed(true);
  }, []);

  if (closed || !(forced || (enabled && due && consentAnswered))) return null;

  return (
    <section
      aria-labelledby="newsletter-banner-title"
      data-testid="newsletter-banner"
      className="on-dark fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-[72rem] bg-violet text-white shadow-[0_0_0_2px_#fff,5px_6px_0_2px_rgba(0,0,0,0.55)] motion-safe:animate-[gd-rise_420ms_var(--ease-out-gear)_both] sm:inset-x-6 lg:bottom-6"
    >
      <div aria-hidden="true" className="gd-rail absolute inset-x-0 top-0 opacity-70" />
      <button
        type="button"
        onClick={close}
        aria-label="Chiudi"
        data-testid="newsletter-close"
        className="absolute right-2 top-2 inline-flex size-11 items-center justify-center text-white/80 hover:text-white"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
      <div className="flex flex-col gap-1 px-4 pb-4 pt-5 lg:flex-row lg:items-center lg:gap-10 lg:px-8 lg:py-6">
        <div className="min-w-0 pr-10 lg:flex-1 lg:pr-0">
          <p className="gd-sticker bg-void px-2 py-0.5 text-[0.6875rem] text-white">Prossimi arrivi</p>
          <h2 id="newsletter-banner-title" className="gd-display-wide mt-3 text-[1.375rem] font-extrabold leading-[0.95] sm:text-[1.75rem] lg:text-[2rem]">
            Questo è solo il{" "}
            <span className="whitespace-nowrap">
              <span className="gd-slab">primo drop</span>,
            </span>
            <span className="gd-display mt-1 block text-[0.9375rem] font-bold not-italic leading-tight tracking-[0.02em] text-white/85 sm:text-[1.0625rem]">
              iscriviti per le novità.
            </span>
          </h2>
        </div>

        <div className="lg:w-[26rem] lg:pr-8">
          {state.ok ? (
            <p role="status" aria-live="polite" data-testid="newsletter-done" className="gd-display mt-3 text-[1rem] font-extrabold tracking-[0.03em] text-lime lg:mt-0">
              {state.message}
            </p>
          ) : (
            <form action={formAction} className="mt-3 lg:mt-0" data-testid="newsletter-form">
              <label htmlFor="newsletter-email" className="sr-only">
                La tua email
              </label>
              {/* Nobody sees this field: a bot that fills it is answered as usual and stored nowhere. */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] size-px opacity-0" />
              <div className="flex gap-2">
                <input
                  id="newsletter-email"
                  name="email"
                  type="email"
                  required
                  maxLength={320}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="la-tua@email.it"
                  aria-describedby={state.message ? "newsletter-error" : "newsletter-promise"}
                  className="h-12 min-w-0 flex-1 border border-white/40 bg-void/45 px-4 text-[1rem] text-white placeholder:text-white/55 focus:border-white focus:outline-none"
                />
                <Button type="submit" variant="primary" size="md" className="shrink-0 px-5" disabled={pending} aria-busy={pending}>
                  {pending ? "Un attimo…" : "Iscriviti"}
                </Button>
              </div>
              {state.message ? (
                <p id="newsletter-error" role="alert" className="mt-2 text-[0.8125rem] font-semibold text-white">
                  {state.message}
                </p>
              ) : null}
              <p id="newsletter-promise" className="mt-3 text-[0.75rem] leading-relaxed text-white/80">
                {NEWSLETTER_PROMISE}{" "}
                <Link href="/legale/privacy" className="text-white underline underline-offset-4 hover:text-lime">
                  Privacy
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
