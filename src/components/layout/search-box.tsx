"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Route } from "next";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Header instant search. An icon button opens a form; typing triggers a debounced
 * server fetch (GET /api/search) so availability is always live. Results are shown in
 * a panel portalled to <body> — the header's backdrop-filter would trap a fixed overlay
 * inside its own stacking context otherwise (same reason mobile-menu.tsx ports out).
 *
 * Empty query → quick-links panel (categories + Nuovi arrivi).
 * ≥2 chars     → combobox with live results or "Nessun risultato".
 * Enter (no active option) → /ricerca?q=… (preserves the existing e2e, owner 2026-10-12).
 */

// SSR-safe "are we on the client" — same pattern as mobile-menu.tsx.
const noop = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

// Shape of one search result from GET /api/search
type SearchItem = {
  slug: string;
  name: string;
  price: string;
  compareAt?: string;
  stock: "disponibile" | "in-arrivo" | "pre-ordine" | "esaurito";
  availability: string;
  image: { src: string; alt: string } | null;
};

// The text-colour token that matches each stock status in the Holo Drop palette.
function availabilityClass(stock: SearchItem["stock"]): string {
  if (stock === "disponibile") return "text-available";
  if (stock === "esaurito") return "text-soldout";
  return "text-preorder"; // "in-arrivo" and "pre-ordine"
}

// Quick links shown when the box is open but the query is too short to search.
// Hardcoded so the client bundle does not carry the entire product catalogue.
type QuickLink = { label: string; href: string };
const QUICK_LINKS: readonly QuickLink[] = [
  { label: "Beyblade X", href: "/negozio/beyblade-x" },
  { label: "Lanciatori", href: "/negozio/lanciatori" },
  { label: "Stadi", href: "/negozio/stadi" },
  { label: "Accessori", href: "/negozio/accessori" },
  { label: "Nuovi arrivi", href: "/negozio?sort=novita" },
];

// A navigable "option" in the combobox: a search result, a quick-link or the "see all" footer.
type Option =
  | { kind: "product"; slug: string }
  | { kind: "link"; href: string }
  | { kind: "see-all" };

// Panel animation: fade + 4 px drop. Disabled under prefers-reduced-motion via CSS globals
// (`transition-duration: 0s !important`), which framer-motion's transforms also respect.
const PANEL_MOTION = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
} as const;

export function SearchBox() {
  const router = useRouter();
  const isClient = useIsClient();
  const listboxId = useId();

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  // The last successfully fetched results. Derive display from isSearching to avoid
  // resetting synchronously in effects (react-hooks/set-state-in-effect).
  const [results, setResults] = useState<SearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Desktop anchor: null until the panel opens on the client for the first time.
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Whether the query is long enough to trigger a server search (≥2 trimmed characters).
  const isSearching = value.trim().length >= 2;

  // Derive the navigable options. Memoised so activateOption (a useCallback) does not
  // re-create on every keystroke — only when the results, query length, or loading state
  // changes. `loading` is included so the catalog fallback link only appears once the
  // fetch has settled with zero results — not while the request is still in-flight
  // (owner, accessibility fix 2026-10-12).
  const options: readonly Option[] = useMemo(
    () =>
      isSearching && results.length > 0
        ? [...results.map((r): Option => ({ kind: "product", slug: r.slug })), { kind: "see-all" }]
        : isSearching && results.length === 0 && !loading
          ? [{ kind: "link", href: "/negozio" }]
          : !isSearching
            ? QUICK_LINKS.map((l): Option => ({ kind: "link", href: l.href }))
            : [],
    [isSearching, results, loading],
  );

  // Clamp activeIndex to the current option count so a stale index from a previous
  // query never points outside the new list.
  const safeActiveIndex = activeIndex < options.length ? activeIndex : -1;

  // Derive display values that naturally go empty when the query is too short —
  // no synchronous setState needed in the debounce effect.
  const displayResults = isSearching ? results : [];
  const displayTotal = isSearching ? total : 0;
  const displayLoading = isSearching && loading;

  // Recompute the desktop anchor right after every open. useLayoutEffect fires before
  // the browser paints, so the panel never appears at the wrong coordinates.
  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPanelPos({ top: rect.bottom, right: window.innerWidth - rect.right });
  }, [open]);

  // Focus the input when the box opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced server search. All setState calls live inside the async callbacks so
  // no setState is called synchronously in the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    // Short query: cancel any in-flight request and return. The display values are derived
    // from isSearching, so they automatically become empty without a setState call here.
    if (value.trim().length < 2) return;

    debounceRef.current = setTimeout(() => {
      const trimmed = value.trim();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);

      void fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error("search error");
          return res.json() as Promise<{ items: SearchItem[]; total: number }>;
        })
        .then(({ items, total: t }) => {
          setResults(items);
          setTotal(t);
          setActiveIndex(-1);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") return;
          setResults([]);
          setTotal(0);
        })
        .finally(() => {
          setLoading(false);
        });
    }, 180);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, open]);

  const close = useCallback(() => {
    setOpen(false);
    setValue("");
    setResults([]);
    setTotal(0);
    setActiveIndex(-1);
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const activateOption = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) return;
      if (option.kind === "product") {
        router.push(`/prodotto/${option.slug}` as Route);
      } else if (option.kind === "link") {
        router.push(option.href as Route);
      } else {
        router.push(`/ricerca?q=${encodeURIComponent(value.trim())}` as Route);
      }
      close();
    },
    [options, value, router, close],
  );



  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const count = options.length;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, count - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (event.key === "Enter") {
      // If an option is highlighted, activate it; otherwise let the form's onSubmit
      // handle the navigation to /ricerca?q=value (keeps responsive.spec.ts passing).
      if (safeActiveIndex >= 0 && safeActiveIndex < count) {
        event.preventDefault();
        activateOption(safeActiveIndex);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
      toggleRef.current?.focus();
    }
  };

  const showQuickLinks = open && !isSearching;
  const showResults = open && isSearching;
  const noResults = showResults && !displayLoading && displayResults.length === 0;

  const activeOptionId = safeActiveIndex >= 0 ? `${listboxId}-opt-${safeActiveIndex}` : undefined;

  // Polite announcement: screen readers hear the result count once a fetch settles.
  // Use the correct Italian singular "risultato" when exactly one item is found
  // (accessibility fix 2026-10-12).
  const announcement =
    showResults && !displayLoading
      ? displayResults.length === 0
        ? `Nessun risultato per ${value.trim()}`
        : displayResults.length === 1
          ? `1 risultato per ${value.trim()}`
          : `${displayResults.length} risultati per ${value.trim()}`
      : "";

  // ── Panel inner content ───────────────────────────────────────────────────────

  const panelInner = (
    <div
      role="listbox"
      id={listboxId}
      aria-label="Risultati di ricerca"
      className="gd-glass-panel divide-y divide-white/[0.06] overflow-hidden rounded-[--radius-glass]"
    >
      {/* Quick-links section (empty query) */}
      {showQuickLinks && (
        <>
          {/* role="separator" is a valid owned child of listbox (unlike <p>); aria-label
              carries the visible text so screen readers still announce it
              (accessibility fix 2026-10-12). */}
          <div
            role="separator"
            aria-label="Sfoglia"
            className="gd-display px-4 pt-3 pb-2 text-[0.6875rem] tracking-[0.06em] text-grey-400"
          >
            Sfoglia
          </div>
          {QUICK_LINKS.map((link, i) => (
            <Link
              key={link.href}
              href={link.href as Route}
              role="option"
              id={`${listboxId}-opt-${i}`}
              aria-selected={safeActiveIndex === i}
              tabIndex={-1}
              onClick={close}
              className={cn(
                "flex min-h-[44px] items-center px-4 py-2.5 text-small text-graphite",
                "transition-colors duration-150 hover:bg-white/[0.06]",
                safeActiveIndex === i && "bg-white/[0.08]",
              )}
            >
              {link.label}
            </Link>
          ))}
        </>
      )}

      {/* Search results section (query ≥2 chars) */}
      {showResults && (
        <>
          {/* Subtle loading hint — no spinner, no jank (owner: minimal motion) */}
          {displayLoading && (
            <div
              aria-hidden="true"
              className="h-0.5 animate-pulse bg-gradient-to-r from-transparent via-lime/40 to-transparent"
            />
          )}

          {noResults && (
            <>
              {/* The "no results" message is informational; the live region already
                  announced it, so sighted keyboard users see it while AT users rely
                  on the announcement. */}
              <p className="px-4 pt-5 pb-2 text-small text-grey-600">
                Nessun risultato per{" "}
                <span className="font-semibold text-graphite">&ldquo;{value.trim()}&rdquo;</span>
              </p>
              {/* Rendered as role="option" so arrow-key navigation can reach the CTA
                  (accessibility fix 2026-10-12). The matching entry in options[] ensures
                  aria-activedescendant and the activeIndex machinery cover it. */}
              <Link
                href="/negozio"
                role="option"
                id={`${listboxId}-opt-0`}
                aria-selected={safeActiveIndex === 0}
                tabIndex={-1}
                onClick={close}
                className={cn(
                  "flex min-h-[44px] items-center px-4 pb-4 text-small text-violet-soft",
                  "underline-offset-2 transition-colors duration-150 hover:underline",
                  safeActiveIndex === 0 && "bg-white/[0.08]",
                )}
              >
                Sfoglia il catalogo
              </Link>
            </>
          )}

          {displayResults.map((item, i) => (
            <Link
              key={item.slug}
              href={`/prodotto/${item.slug}` as Route}
              role="option"
              id={`${listboxId}-opt-${i}`}
              aria-selected={safeActiveIndex === i}
              tabIndex={-1}
              onClick={close}
              className={cn(
                "flex min-h-[44px] items-center gap-3 px-3 py-2",
                "transition-colors duration-150 hover:bg-white/[0.06]",
                safeActiveIndex === i && "bg-white/[0.08]",
              )}
            >
              {/* Thumbnail — plain <img> as specified by the lead; next/image overhead
                  is not worth it for ≤6 items that are already 48px and lazily loaded.
                  The next/image rule is suppressed on the line below. */}
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image.src}
                  alt={item.image.alt}
                  width={48}
                  height={48}
                  loading="lazy"
                  className="size-12 shrink-0 rounded object-contain"
                />
              ) : (
                <div className="size-12 shrink-0 rounded bg-white/[0.04]" aria-hidden="true" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium text-graphite">{item.name}</p>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="gd-mono text-small font-semibold text-graphite">
                    {item.price}
                  </span>
                  {item.compareAt && (
                    <span className="gd-mono text-[0.75rem] text-grey-400 line-through">
                      {item.compareAt}
                    </span>
                  )}
                </div>
                <p className={cn("gd-mono text-[0.6875rem]", availabilityClass(item.stock))}>
                  {item.availability}
                </p>
              </div>
            </Link>
          ))}

          {/* "See all" footer */}
          {displayResults.length > 0 && (
            <Link
              href={`/ricerca?q=${encodeURIComponent(value.trim())}` as Route}
              role="option"
              id={`${listboxId}-opt-${displayResults.length}`}
              aria-selected={safeActiveIndex === displayResults.length}
              tabIndex={-1}
              onClick={close}
              className={cn(
                "flex min-h-[44px] items-center justify-between px-4 py-3",
                "text-small text-violet-soft transition-colors duration-150 hover:bg-white/[0.06]",
                safeActiveIndex === displayResults.length && "bg-white/[0.08]",
              )}
            >
              <span>Vedi tutti i risultati</span>
              <span className="gd-mono tabular text-grey-400">({displayTotal})</span>
            </Link>
          )}
        </>
      )}
    </div>
  );

  // ── Portal ────────────────────────────────────────────────────────────────────

  // CSS custom properties that drive the desktop anchor (sm:top-[var(--sp-top)] etc).
  // Always provided (never undefined) so there's no exactOptionalPropertyTypes conflict
  // when passing to a regular <div>; the sm: prefixed Tailwind classes that read them
  // are only active at ≥640 px, so the defaults are harmless on mobile.
  const panelVars = {
    "--sp-top": `${(panelPos?.top ?? 72) + 8}px`,
    "--sp-right": `${panelPos?.right ?? 0}px`,
  } as React.CSSProperties;

  const portal = (
    <AnimatePresence>
      {open ? (
        <>
          {/* Transparent backdrop that catches click-outside events */}
          <div className="fixed inset-0 z-[101]" aria-hidden="true" onClick={close} />

          {/* Panel: mobile = full-width strip below header, desktop = anchored below input.
              CSS variables are carried by the plain <div> wrapper (CSSProperties is fine
              there), so the motion.div never receives an incompatible style type. */}
          <div style={panelVars} className="contents">
            <motion.div
              {...PANEL_MOTION}
              data-testid="search-panel"
              className={cn(
                // Common
                "fixed z-[102] overflow-hidden",
                // Mobile (< sm = 640 px): full-width, scrollable, right below header (h-16 = 64px)
                // Below the 4rem header and the ~4.0625rem search strip on a phone.
                "inset-x-0 top-[8.0625rem] max-h-[calc(100dvh-8.0625rem-5rem)] overflow-y-auto",
                // Desktop (≥ sm): narrow anchored panel; position read from CSS vars above
                "sm:inset-x-[unset] sm:max-h-none sm:w-[460px]",
                "sm:top-[var(--sp-top,80px)] sm:right-[var(--sp-right,0px)]",
              )}
            >
              {panelInner}
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );

  return (
    // z-[103] keeps this container above the z-[101] backdrop so pointer events on the
    // input are not swallowed by the backdrop while the panel is open (accessibility
    // fix 2026-10-12).
    <div ref={containerRef} className="relative z-[103] flex items-center gap-1.5">
      {/* Polite live region — screen readers hear the count after each fetch without interruption */}
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </span>

      {/* Inline expanding search form */}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.form
            key="form"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            // On a phone the header has no room for the field: it drops below the header as a
            // full-width strip, as before instant search (the header's backdrop-filter makes
            // "fixed" relative to the header, so top-full is right under it).
            // On desktop the field opens over the navigation instead of pushing it: eight menu
            // items plus a 15rem field overflowed the header at 1280-1440px and pushed the cart
            // icon off screen.
            className="overflow-hidden max-sm:fixed max-sm:inset-x-0 max-sm:top-full max-sm:w-auto! max-sm:border-b max-sm:border-white/[0.07] max-sm:bg-void/95 max-sm:px-3 max-sm:py-2.5 max-sm:backdrop-blur-md lg:absolute lg:right-full lg:top-1/2 lg:mr-1.5 lg:-translate-y-1/2 lg:bg-void"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              const query = value.trim();
              if (!query) return;
              // Enter with no active option: submit to /ricerca (responsive.spec.ts contract).
              router.push(`/ricerca?q=${encodeURIComponent(query)}` as Route);
              close();
            }}
          >
            <label className="sr-only" htmlFor="site-search">
              Cerca prodotti
            </label>
            <input
              id="site-search"
              ref={inputRef}
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={activeOptionId}
              aria-haspopup="listbox"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Cerca un Beyblade"
              data-testid="search-input"
              autoComplete="off"
              className="h-11 w-full border border-white/10 bg-white/[0.05] px-4 text-base text-graphite placeholder:text-grey-400 focus:border-lime focus:outline-none sm:w-44 sm:text-small lg:w-72 xl:w-80"
            />
          </motion.form>
        ) : null}
      </AnimatePresence>

      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={open ? "Chiudi ricerca" : "Apri ricerca"}
        data-testid="search-toggle"
        className="inline-flex size-11 shrink-0 items-center justify-center border border-white/10 text-graphite transition-colors duration-200 hover:border-lime hover:text-lime"
      >
        {open ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <Search className="size-5" strokeWidth={1.8} aria-hidden="true" />
        )}
      </button>

      {isClient ? createPortal(portal, document.body) : null}
    </div>
  );
}
