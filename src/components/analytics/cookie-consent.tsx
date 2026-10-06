"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analyticsCookieNames, type ConsentChoice, OPEN_CONSENT_EVENT, readConsent, writeConsent } from "@/lib/analytics/consent";
import { disableGoogleAnalytics, loadGoogleAnalytics, sendPageView } from "@/lib/analytics/google";

/** Fired when this tab records a choice, so every reader re-reads it. */
const CHANGE_EVENT = "gd:cookie-consent-changed";
/** A choice made where storage is blocked still holds for the rest of the visit. */
let visitChoice: ConsentChoice | null = null;

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function storedChoice(): "ask" | "granted" | "refused" {
  const choice = readConsent() ?? visitChoice;
  if (!choice) return "ask";
  return choice.analytics ? "granted" : "refused";
}

/** The server cannot know the choice: it renders no banner and no tag. */
const serverChoice = () => "server" as const;

/**
 * The cookie banner, and Google Analytics behind it.
 *
 * Accetta and Rifiuta carry the same weight, as the Garante asks; the X refuses too. Until the
 * visitor accepts, nothing from Google loads. The choice is kept for six months and can be
 * changed from "Gestisci cookie" in the footer.
 */
export function CookieConsent({ enabled }: { readonly enabled: boolean }) {
  const pathname = usePathname();
  const stored = useSyncExternalStore(subscribe, storedChoice, serverChoice);
  const [reopened, setReopened] = useState(false);
  const granted = enabled && stored === "granted";
  const open = enabled && (stored === "ask" || reopened);

  useEffect(() => {
    const reopen = () => setReopened(true);
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  useEffect(() => {
    if (granted) loadGoogleAnalytics();
  }, [granted]);

  useEffect(() => {
    if (!granted) return;
    // After the commit, so the new page's title is in place.
    const timer = window.setTimeout(() => sendPageView(pathname), 0);
    return () => window.clearTimeout(timer);
  }, [granted, pathname]);

  if (!open) return null;

  const choose = (analytics: boolean) => {
    visitChoice = writeConsent(analytics);
    if (!analytics && granted) disableGoogleAnalytics(analyticsCookieNames(document.cookie));
    setReopened(false);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      data-testid="cookie-consent"
      className="on-dark fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-xl border border-white/15 bg-void/95 p-5 shadow-2xl backdrop-blur-md sm:inset-x-6 lg:bottom-6"
    >
      <button
        type="button"
        onClick={() => choose(false)}
        aria-label="Chiudi e rifiuta i cookie di statistica"
        className="absolute right-2 top-2 inline-flex size-10 items-center justify-center text-grey-600 hover:text-lime"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
      <h2 id="cookie-consent-title" className="gd-display pr-10 text-[0.9375rem] font-bold tracking-[0.06em] text-graphite">
        Cookie e statistiche
      </h2>
      <p className="mt-2 text-small leading-relaxed text-grey-600">
        Usiamo cookie tecnici necessari al sito. Se accetti, usiamo anche Google Analytics per contare le visite e capire
        quali pagine funzionano: niente pubblicità, niente profilazione. Dettagli in{" "}
        <Link href="/legale/privacy" className="text-lime underline-offset-4 hover:underline">
          Privacy e cookie
        </Link>
        .
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="glass" size="sm" type="button" onClick={() => choose(false)} data-testid="cookie-reject">
          Rifiuta
        </Button>
        <Button variant="glass" size="sm" type="button" onClick={() => choose(true)} data-testid="cookie-accept">
          Accetta
        </Button>
      </div>
    </section>
  );
}

/** "Gestisci cookie" in the footer: reopens the banner to change the choice. */
export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
      className="text-small text-grey-600 transition-colors hover:text-lime"
      data-testid="cookie-settings"
    >
      Gestisci cookie
    </button>
  );
}
