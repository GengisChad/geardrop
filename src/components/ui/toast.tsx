"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/** Feedback tones from design system §12 "AVVISI & FEEDBACK". */
type Tone = "success" | "info" | "error";

type Toast = { id: number; tone: Tone; message: string };

type ToastContext = { push: (toast: { tone: Tone; message: string }) => void };

const Context = createContext<ToastContext | null>(null);

const TONE_STYLE: Record<Tone, { icon: typeof Info; ring: string; iconColor: string }> = {
  success: { icon: CheckCircle2, ring: "border-available/40", iconColor: "text-available" },
  info: { icon: Info, ring: "border-violet/40", iconColor: "text-violet" },
  error: { icon: XCircle, ring: "border-soldout/40", iconColor: "text-soldout" },
};

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    ({ tone, message }: { tone: Tone; message: string }) => {
      const id = nextId++;
      // Cap the stack so rapid adds can't bury the page.
      setToasts((current) => [...current.slice(-2), { id, tone, message }]);
      setTimeout(() => dismiss(id), 3600);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <Context.Provider value={value}>
      {children}
      <div
        // Announced politely: adding to cart shouldn't interrupt a screen reader mid-sentence.
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-auto sm:left-auto sm:right-6 sm:top-24 sm:items-end"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const { icon: Icon, ring, iconColor } = TONE_STYLE[toast.tone];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className={cn(
                  "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border bg-white px-4 py-3",
                  "shadow-[0_12px_32px_-8px_rgba(18,20,23,0.28)]",
                  ring,
                )}
              >
                <Icon className={cn("size-5 shrink-0", iconColor)} aria-hidden="true" />
                <p className="flex-1 text-small text-graphite">{toast.message}</p>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Chiudi notifica"
                  className="shrink-0 rounded-full p-1 text-grey-600 transition-colors hover:bg-grey-100 hover:text-graphite"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Context.Provider>
  );
}

export function useToast(): ToastContext {
  const context = useContext(Context);
  if (!context) throw new Error("useToast va usato dentro <ToastProvider>");
  return context;
}
