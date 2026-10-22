"use client";

import { useState } from "react";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { TextInput } from "@/components/ui/field";
import { INPOST_POINT_FINDER_URL } from "@/data/catalog";
import { lockerLabel, type Locker } from "@/lib/shipping/locker";
import { cn } from "@/lib/cn";

/** What the form keeps: the line printed on the order and InPost's id, when it came from the search. */
export type PickedLocker = { readonly label: string; readonly id: string | null };

type Props = {
  readonly value: PickedLocker | null;
  readonly onChange: (value: PickedLocker | null) => void;
  readonly hasError?: boolean;
  /** Prefix for element ids, so the cart and the checkout can both host one. */
  readonly idPrefix: string;
};

type SearchState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "results"; readonly lockers: readonly Locker[] }
  | { readonly kind: "error"; readonly message: string }
  /** The search itself is down: the buyer types the Locker by hand, as before 2026-10-23. */
  | { readonly kind: "manual" };

function distanceText(metres: number | null): string | null {
  if (metres === null) return null;
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1).replace(".", ",")} km`;
}

/**
 * The buyer finds a Locker by CAP, town or position and picks one from the list. The order then
 * carries InPost's id for it, which is what the shipment and its label are made out to.
 */
export function LockerPicker({ value, onChange, hasError = false, idPrefix }: Props) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "idle" });

  async function search(params: URLSearchParams) {
    setState({ kind: "loading" });
    try {
      const response = await fetch(`/api/inpost/lockers?${params.toString()}`);
      const payload = (await response.json()) as { lockers?: Locker[]; error?: string };
      if (response.status === 503 || response.status === 502) {
        setState({ kind: "manual" });
        return;
      }
      if (!response.ok) {
        setState({ kind: "error", message: payload.error ?? "Ricerca non riuscita." });
        return;
      }
      setState({ kind: "results", lockers: payload.lockers ?? [] });
    } catch {
      setState({ kind: "manual" });
    }
  }

  function searchText() {
    const text = query.trim();
    if (/^\d{5}$/.test(text)) void search(new URLSearchParams({ cap: text }));
    else if (text.length >= 2) void search(new URLSearchParams({ citta: text }));
    else setState({ kind: "error", message: "Scrivi un CAP di 5 cifre o il nome della città." });
  }

  function searchNearMe() {
    if (!("geolocation" in navigator)) {
      setState({ kind: "error", message: "Il browser non condivide la posizione: cerca per CAP." });
      return;
    }
    setState({ kind: "loading" });
    navigator.geolocation.getCurrentPosition(
      (position) =>
        void search(new URLSearchParams({ lat: position.coords.latitude.toFixed(5), lng: position.coords.longitude.toFixed(5) })),
      () => setState({ kind: "error", message: "Posizione non disponibile: cerca per CAP." }),
      { timeout: 10000, maximumAge: 600000 },
    );
  }

  if (value) {
    return (
      <div
        className="flex items-start gap-3 rounded-xl border border-violet bg-violet-tint p-3.5"
        data-testid={`${idPrefix}-locker-picked`}
      >
        <MapPin className="mt-0.5 size-4 shrink-0 text-violet" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-small text-graphite">{value.label}</span>
        <button
          type="button"
          className="shrink-0 text-[0.6875rem] font-semibold text-violet underline-offset-2 hover:underline"
          onClick={() => onChange(null)}
        >
          Cambia
        </button>
      </div>
    );
  }

  if (state.kind === "manual") {
    return (
      <div className="flex flex-col gap-1.5">
        <TextInput
          id={`${idPrefix}-locker-manual`}
          autoComplete="off"
          placeholder="Es. codice o indirizzo del Locker"
          hasError={hasError}
          onBlur={(event) => {
            const label = event.currentTarget.value.trim();
            if (label.length >= 3) onChange({ label, id: null });
          }}
        />
        <span className="text-[0.6875rem] text-grey-600">
          La ricerca non risponde.{" "}
          <a className="font-semibold text-violet underline-offset-2 hover:underline" href={INPOST_POINT_FINDER_URL} rel="noreferrer" target="_blank">
            Trova il Locker sulla mappa InPost
          </a>{" "}
          e scrivi qui il codice o l&apos;indirizzo.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5" data-testid={`${idPrefix}-locker-picker`}>
      <div className="flex gap-2">
        <TextInput
          id={`${idPrefix}-locker-search`}
          aria-label="CAP o città del Locker"
          autoComplete="postal-code"
          enterKeyHint="search"
          placeholder="CAP o città"
          hasError={hasError}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            // Enter searches; it must not submit the checkout form around this field.
            if (event.key === "Enter") {
              event.preventDefault();
              searchText();
            }
          }}
        />
        <button
          type="button"
          onClick={searchText}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-grey-300 px-3.5 text-small font-semibold text-graphite transition-colors hover:border-violet"
        >
          <Search className="size-4" aria-hidden="true" />
          Cerca
        </button>
      </div>
      <button
        type="button"
        onClick={searchNearMe}
        className="inline-flex items-center gap-1.5 self-start text-[0.6875rem] font-semibold text-violet underline-offset-2 hover:underline"
      >
        <Crosshair className="size-3.5" aria-hidden="true" />
        Usa la mia posizione
      </button>

      {state.kind === "loading" ? (
        <p className="flex items-center gap-2 text-[0.6875rem] text-grey-600" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Cerco i Locker…
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p className="text-[0.6875rem] text-soldout" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.kind === "results" && state.lockers.length === 0 ? (
        <p className="text-[0.6875rem] text-grey-600" role="status">
          Nessun Locker trovato qui: prova il CAP o una città vicina.
        </p>
      ) : null}
      {state.kind === "results" && state.lockers.length > 0 ? (
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1" aria-label="Locker trovati">
          {state.lockers.map((locker) => (
            <li key={locker.id}>
              <button
                type="button"
                onClick={() => onChange({ label: lockerLabel(locker), id: locker.id })}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border border-grey-300 p-3 text-left transition-colors hover:border-violet",
                )}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-violet-soft" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold text-graphite">
                    {locker.street}, {locker.city}
                  </span>
                  <span className="block text-[0.6875rem] text-grey-600">
                    {[locker.place, locker.code, locker.openAllDay ? "aperto 24 ore" : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {distanceText(locker.distance) ? (
                  <span className="tabular shrink-0 text-[0.6875rem] text-grey-600">{distanceText(locker.distance)}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
