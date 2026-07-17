"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Emblem } from "@/components/layout/logo";
import { MAIN_NAV } from "@/lib/navigation";
import { cn } from "@/lib/cn";

// SSR-safe "are we on the client" without a setState-in-effect. Returns false on the
// server and during the first client render, then true — so the body portal only mounts
// where document exists, and the AnimatePresence inside stays mounted for exit anims.
const noop = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const isClient = useIsClient();
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

  // The overlay is portalled to <body>. The header carries `backdrop-filter`, which makes
  // it a containing block for fixed descendants AND caps their z-index inside its own
  // stacking context — so a menu rendered in place stays trapped in the header strip and
  // paints behind the page. Escaping to the body root removes both traps.
  const overlay = (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[100] bg-graphite/50 backdrop-blur-sm lg:hidden"
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
            className="gd-glass-panel fixed inset-y-0 left-0 z-[110] flex w-[86%] max-w-sm flex-col rounded-r-[--radius-glass-lg] border-y-0 border-l-0 lg:hidden"
          >
            <div className="flex items-center justify-between border-b border-white/40 px-5 py-4">
              {/* The emblem is the mark used in the mobile menu. (audit §7.2) */}
              <Emblem size={36} className="size-9" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Chiudi il menu"
                className="inline-flex size-10 items-center justify-center rounded-full transition-colors hover:bg-white/60"
              >
                <X className="size-5 text-graphite" aria-hidden="true" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="flex flex-col">
                {MAIN_NAV.map((item, index) => (
                  <motion.li
                    key={item.label}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 * index + 0.05, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Link
                      href={item.href}
                      className={cn(
                        "gd-display flex items-center justify-between border-b border-white/30 py-4 text-h3 font-bold tracking-tight",
                        item.tone === "lime" && "text-lime-ink",
                        item.tone === "violet" && "text-violet",
                        !item.tone && "text-graphite",
                      )}
                    >
                      {item.label}
                    </Link>
                  </motion.li>
                ))}
              </ul>
            </nav>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Apri il menu"
        aria-expanded={open}
        data-testid="mobile-menu-open"
        className="inline-flex size-10 items-center justify-center rounded-full transition-colors hover:bg-white/60 lg:hidden"
      >
        <Menu className="size-6 text-graphite" strokeWidth={2.5} aria-hidden="true" />
      </button>

      {isClient ? createPortal(overlay, document.body) : null}
    </>
  );
}
