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
    <div className="relative flex items-center">
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
              placeholder="Cerca prodotti..."
              data-testid="search-input"
              className="h-10 w-44 rounded-full border border-grey-300 bg-white px-4 text-small text-graphite placeholder:text-grey-400 focus:border-violet focus:outline-none lg:w-60"
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
        className="inline-flex size-10 items-center justify-center rounded-full transition-colors hover:bg-grey-100"
      >
        {open ? (
          <X className="size-5 text-graphite" aria-hidden="true" />
        ) : (
          <Search className="size-5 text-graphite" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
