"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Emblem } from "@/components/layout/logo";
import { MAIN_NAV } from "@/lib/navigation";
import { cn } from "@/lib/cn";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);

  // A route change closes the sheet; without this, tapping a link leaves it open.
  // Adjusted during render rather than in an effect, so the sheet never paints open
  // on the new route for a frame.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

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
        aria-label="Apri il menu"
        aria-expanded={open}
        data-testid="mobile-menu-open"
        className="inline-flex size-10 items-center justify-center rounded-full transition-colors hover:bg-grey-100 lg:hidden"
      >
        <Menu className="size-6 text-graphite" strokeWidth={2.5} aria-hidden="true" />
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
              aria-label="Menu di navigazione"
              data-testid="mobile-menu"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 40 }}
              className="fixed inset-y-0 left-0 z-[95] flex w-[86%] max-w-sm flex-col bg-white lg:hidden"
            >
              <div className="flex items-center justify-between border-b border-grey-200 px-5 py-4">
                {/* The emblem is the mark used in the mobile menu. (audit §7.2) */}
                <Emblem size={36} className="size-9" />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Chiudi il menu"
                  className="inline-flex size-10 items-center justify-center rounded-full hover:bg-grey-100"
                >
                  <X className="size-5 text-graphite" aria-hidden="true" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto px-5 py-4">
                <ul className="flex flex-col">
                  {MAIN_NAV.map((item) => (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        className={cn(
                          "gd-display flex items-center justify-between border-b border-grey-100 py-4 text-h3 font-bold tracking-tight",
                          item.tone === "lime" && "text-lime-ink",
                          item.tone === "violet" && "text-violet",
                          !item.tone && "text-graphite",
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
