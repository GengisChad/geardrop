"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/** Feedback tones from design system §12 "AVVISI & FEEDBACK". */
type Tone = "success" | "info" | "error";

/** A next step the toast offers, such as "Vai al carrello" after an add. */
type ToastAction = { readonly label: string; readonly href: Route };

type ToastInput = {
  tone: Tone;
  message: string;
  detail?: string;
  action?: ToastAction;
  /**
   * Live content under the detail, such as the free-shipping line after an add. Only the newest
   * toast renders it, so a stack of toasts never multiplies the requests behind it.
   */
  footer?: ReactNode;
};

type Toast = ToastInput & { id: number };

type ToastContext = { push: (toast: ToastInput) => void };

const Context = createContext<ToastContext | null>(null);

const TONE_STYLE: Record<Tone, { icon: typeof Info; ring: string; iconColor: string }> = {
  success: { icon: CheckCircle2, ring: "border-available/40", iconColor: "text-available" },
  info: { icon: Info, ring: "border-violet/40", iconColor: "text-violet-soft" },
  error: { icon: XCircle, ring: "border-soldout/40", iconColor: "text-soldout" },
};

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId++;
      // Cap the stack so rapid adds can't bury the page.
      setToasts((current) => [...current.slice(-2), { ...input, id }]);
      // A toast with a next step stays long enough to be tapped.
      setTimeout(() => dismiss(id), input.action ? 6000 : 3600);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);
  const newest = toasts.at(-1)?.id;

  return (
    <Context.Provider value={value}>
      {children}
      <div
        // Announced politely: adding to cart shouldn't interrupt a screen reader mid-sentence.
        aria-live="polite"
        aria-atomic="false"
        className="gd-toast-stack pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-auto sm:left-auto sm:right-6 sm:top-24 sm:items-end"
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
                className={cn("gd-glass-compact pointer-events-auto flex w-full max-w-sm flex-col gap-1 rounded-xl px-4 py-3", ring)}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn("size-5 shrink-0", iconColor)} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-small text-graphite">{toast.message}</p>
                    {toast.detail ? <p className="mt-0.5 text-[0.6875rem] text-grey-600">{toast.detail}</p> : null}
                  </div>
                  {toast.action ? (
                    <Link
                      href={toast.action.href}
                      onClick={() => dismiss(toast.id)}
                      data-testid="toast-action"
                      className="gd-display inline-flex h-11 shrink-0 items-center whitespace-nowrap bg-lime px-3.5 text-[0.75rem] font-bold tracking-wider text-void transition-colors hover:bg-lime-ink"
                    >
                      {toast.action.label}
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => dismiss(toast.id)}
                    aria-label="Chiudi notifica"
                    className="-m-2 inline-flex size-12 shrink-0 items-center justify-center text-grey-600 transition-colors hover:bg-grey-100 hover:text-graphite"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                {/* Full width under the row, aligned with the text: beside the button it wrapped word by word. */}
                {toast.footer && toast.id === newest ? <div className="pl-8">{toast.footer}</div> : null}
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
