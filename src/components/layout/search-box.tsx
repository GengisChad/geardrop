"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

/** Header search: an icon that expands into a real form, so Enter submits natively. */
export function SearchBox() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative flex items-center gap-1.5">
      <AnimatePresence initial={false}>
        {open ? (
          <motion.form
            key="form"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              const query = value.trim();
              if (!query) return;
              router.push(`/ricerca?q=${encodeURIComponent(query)}`);
              setOpen(false);
            }}
          >
            <label className="sr-only" htmlFor="site-search">
              Cerca prodotti
            </label>
            <input
              id="site-search"
              ref={inputRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Cerca un Beyblade"
              data-testid="search-input"
              className="h-11 w-40 border border-white/10 bg-white/[0.05] px-4 text-small text-graphite placeholder:text-grey-400 focus:border-lime focus:outline-none sm:w-44 lg:w-60"
            />
          </motion.form>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? "Chiudi ricerca" : "Apri ricerca"}
        data-testid="search-toggle"
        className="gd-chamfer inline-flex size-11 items-center justify-center bg-white/[0.07] text-graphite transition-colors duration-200 hover:bg-lime hover:text-void"
      >
        {open ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <Search className="size-5" strokeWidth={1.8} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
