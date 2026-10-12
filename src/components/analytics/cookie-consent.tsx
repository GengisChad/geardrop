"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  analyticsCookieNames,
  type ConsentChoice,
  type ConsentPurposes,
  marketingCookieNames,
  OPEN_CONSENT_EVENT,
  readConsent,
  writeConsent,
} from "@/lib/analytics/consent";
import {
  denyMarketing,
  disableGoogleAnalytics,
  dropQueuedEvents,
  loadGoogleAnalytics,
  sendPageView,
} from "@/lib/analytics/google";

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

/** The stored choice as a stable string: "ask", or "a1m0"-style flags for statistics and marketing. */
function storedChoice(): string {
  const choice = readConsent() ?? visitChoice;
  if (!choice) return "ask";
  return `a${choice.analytics ? 1 : 0}m${choice.marketing ? 1 : 0}`;
}

/** The server cannot know the choice: it renders no banner and no tag. */
const serverChoice = () => "server";

const purposesOf = (stored: string): ConsentPurposes => ({
  analytics: stored.includes("a1"),
  marketing: stored.includes("m1"),
});

const NONE: ConsentPurposes = { analytics: false, marketing: false };
const ALL: ConsentPurposes = { analytics: true, marketing: true };

/**
 * The cookie banner, and Google Analytics and Ads measurement behind it.
 *
 * "Rifiuta" and "Accetta tutto" carry the same weight, as the Garante asks; the X refuses too.
 * "Personalizza" opens the two purposes one by one, never pre-ticked. Until the visitor accepts
 * statistics nothing from Google loads; marketing on top lets Google Ads count the sales its
 * campaigns bring. The choice is kept for six months and can be changed from "Gestisci cookie".
 */
export function CookieConsent({ enabled }: { readonly enabled: boolean }) {
  const pathname = usePathname();
  const stored = useSyncExternalStore(subscribe, storedChoice, serverChoice);
  const [reopened, setReopened] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [draft, setDraft] = useState<ConsentPurposes>(NONE);
  const answered = stored !== "ask" && stored !== "server";
  const current = answered ? purposesOf(stored) : NONE;
  const granted = enabled && current.analytics;
  const open = enabled && (stored === "ask" || reopened);

  useEffect(() => {
    const reopen = () => {
      setReopened(true);
      setCustomizing(true);
      setDraft(purposesOf(storedChoice()));
    };
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  useEffect(() => {
    if (granted) loadGoogleAnalytics({ analytics: true, marketing: current.marketing });
    else if (answered) dropQueuedEvents();
  }, [granted, answered, current.marketing]);

  useEffect(() => {
    if (!granted) return;
    // After the commit, so the new page's title is in place.
    const timer = window.setTimeout(() => sendPageView(pathname), 0);
    return () => window.clearTimeout(timer);
  }, [granted, pathname]);

  if (!open) return null;

  const choose = (next: ConsentPurposes) => {
    // Marketing measures sales through Analytics: without statistics it would do nothing, so it is not kept.
    const purposes = { analytics: next.analytics, marketing: next.analytics && next.marketing };
    visitChoice = writeConsent(purposes);
    const cookies = document.cookie;
    if (current.analytics && !purposes.analytics) {
      disableGoogleAnalytics([...analyticsCookieNames(cookies), ...marketingCookieNames(cookies)]);
    } else if (current.marketing && !purposes.marketing) {
      denyMarketing(marketingCookieNames(cookies));
    }
    setReopened(false);
    setCustomizing(false);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      data-testid="cookie-consent"
      className="on-dark fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-h-[calc(100dvh-7rem)] max-w-xl overflow-y-auto border border-white/15 bg-void/95 p-5 shadow-2xl backdrop-blur-md sm:inset-x-6 lg:bottom-6"
    >
      <button
        type="button"
        onClick={() => choose(NONE)}
        aria-label="Chiudi e rifiuta i cookie non necessari"
        className="absolute right-2 top-2 inline-flex size-10 items-center justify-center text-grey-600 hover:text-lime"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
      <h2 id="cookie-consent-title" className="gd-display pr-10 text-[0.9375rem] font-bold tracking-[0.06em] text-graphite">
        Cookie, statistiche e marketing
      </h2>
      <p className="mt-2 text-small leading-relaxed text-grey-600">
        Usiamo cookie tecnici necessari al sito. Con il tuo consenso usiamo anche Google Analytics per contare le visite
        e, se accetti il marketing, Google Ads per misurare e mostrare le nostre pubblicità su Google. Dettagli in{" "}
        <Link href="/legale/privacy" className="text-lime underline-offset-4 hover:underline">
          Privacy e cookie
        </Link>
        .
      </p>

      {customizing ? (
        <fieldset className="mt-4 flex flex-col gap-3" data-testid="cookie-purposes">
          <legend className="sr-only">Scegli i cookie da attivare</legend>
          <label className="flex items-start gap-3 text-small text-grey-600">
            <input type="checkbox" checked disabled className="mt-1 size-4 accent-lime" />
            <span>
              <span className="font-bold text-graphite">Tecnici</span> · sempre attivi: carrello, preferiti e accesso.
            </span>
          </label>
          <label className="flex items-start gap-3 text-small text-grey-600">
            <input
              type="checkbox"
              checked={draft.analytics}
              onChange={(event) => setDraft((value) => ({ ...value, analytics: event.target.checked, marketing: event.target.checked && value.marketing }))}
              className="mt-1 size-4 accent-lime"
              data-testid="cookie-analytics"
            />
            <span>
              <span className="font-bold text-graphite">Statistiche</span> · Google Analytics: quante visite, da dove
              arrivano, quali pagine funzionano.
            </span>
          </label>
          <label className="flex items-start gap-3 text-small text-grey-600">
            <input
              type="checkbox"
              checked={draft.marketing}
              disabled={!draft.analytics}
              onChange={(event) => setDraft((value) => ({ ...value, marketing: event.target.checked }))}
              className="mt-1 size-4 accent-lime disabled:opacity-40"
              data-testid="cookie-marketing"
            />
            <span>
              <span className="font-bold text-graphite">Marketing</span> · Google Ads: misura le vendite arrivate dalle
              nostre pubblicità e le mostra a chi ha già visitato il sito. Funziona solo insieme alle statistiche.
            </span>
          </label>
          <Button variant="glass" size="sm" type="button" onClick={() => choose(draft)} data-testid="cookie-save">
            Salva le scelte
          </Button>
        </fieldset>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="glass" size="sm" type="button" onClick={() => choose(NONE)} data-testid="cookie-reject">
          Rifiuta
        </Button>
        <Button variant="glass" size="sm" type="button" onClick={() => choose(ALL)} data-testid="cookie-accept">
          Accetta tutto
        </Button>
      </div>
      {customizing ? null : (
        <button
          type="button"
          onClick={() => {
            setDraft(NONE);
            setCustomizing(true);
          }}
          className="mt-3 text-small text-grey-600 underline-offset-4 hover:text-lime hover:underline"
          data-testid="cookie-customize"
        >
          Personalizza
        </button>
      )}
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
