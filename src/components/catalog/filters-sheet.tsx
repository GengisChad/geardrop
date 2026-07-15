"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Filters } from "@/components/catalog/filters";
import { Button } from "@/components/ui/button";
import type { CategorySlug, Facets } from "@/lib/commerce/types";

/** Mobile: the sidebar becomes a sheet. (audit §6) */
export function FiltersSheet({ facets, lockedCategory }: { facets: Facets; lockedCategory?: CategorySlug }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="filters-open"
        className="gd-display inline-flex h-10 items-center gap-2 rounded-full border border-grey-300 bg-white px-4 text-small font-bold tracking-wider text-graphite transition-colors hover:border-violet lg:hidden"
      >
        <SlidersHorizontal className="size-4 text-violet" aria-hidden="true" />
        Filtri
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[90] bg-graphite/60 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Filtri"
              data-testid="filters-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
              className="fixed inset-x-0 bottom-0 z-[95] flex max-h-[88dvh] flex-col rounded-t-2xl bg-white lg:hidden"
            >
              <div className="flex items-center justify-between border-b border-grey-200 px-5 py-4">
                <h2 className="text-h3 font-bold text-graphite">Filtri</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Chiudi i filtri"
                  className="inline-flex size-10 items-center justify-center rounded-full hover:bg-grey-100"
                >
                  <X className="size-5 text-graphite" aria-hidden="true" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                <Filters facets={facets} {...(lockedCategory ? { lockedCategory } : {})} />
              </div>

              <div className="border-t border-grey-200 p-4">
                <Button variant="secondary" fullWidth onClick={() => setOpen(false)} data-testid="filters-apply">
                  Mostra {facets.total} prodotti
                </Button>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
