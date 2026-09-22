"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { requestRestockNoticeAction } from "@/app/actions/restock-notice";
import type { RestockNoticeState } from "@/app/actions/restock-notice";
import { cn } from "@/lib/cn";

type RestockFormProps = {
  slug: string;
  name: string;
  /** A drop that sold its pieces reopens: the notice says so. */
  releasePreorder?: boolean;
};

const initial: RestockNoticeState = { ok: false, message: "" };

/**
 * Inline "Avvisami" form shown on the PDP when a product is sold out.
 * Progressive enhancement: works without JS via form action; useActionState adds
 * live feedback without a page reload when JS is available.
 * Exposed as id="restock-form" so the sticky bar can scroll/focus it.
 */
export function RestockForm({ slug, name, releasePreorder }: RestockFormProps) {
  const emailId = useId();
  const [state, formAction, pending] = useActionState(requestRestockNoticeAction, initial);

  if (state.ok) {
    return (
      <div
        id="restock-form"
        className="flex items-center gap-3 rounded-xl border border-available/30 bg-available-bg px-4 py-4"
        role="status"
        aria-live="polite"
      >
        <Check className="size-5 shrink-0 text-available" strokeWidth={2.5} aria-hidden="true" />
        <p className="gd-display text-small font-bold text-available">
          {releasePreorder ? "Ti avvisiamo appena riaprono i pre-ordini." : state.message}
        </p>
      </div>
    );
  }

  return (
    <form
      id="restock-form"
      action={formAction}
      noValidate
      className="flex flex-col gap-3 rounded-xl border border-soldout/20 bg-soldout-bg px-4 py-4"
    >
      <input type="hidden" name="slug" value={slug} />

      <div className="flex items-center gap-2">
        <Bell className="size-4 shrink-0 text-soldout" aria-hidden="true" />
        <p className="gd-display text-small font-bold text-soldout">
          {releasePreorder ? `Avvisami quando riaprono i pre-ordini di ${name}` : `Avvisami quando ${name} torna disponibile`}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <label htmlFor={emailId} className="sr-only">
            Indirizzo email
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="La tua email"
            required
            maxLength={320}
            aria-describedby={state.message ? `${emailId}-error` : undefined}
            className={cn(
              "h-12 w-full rounded-xl border bg-void/60 px-4 text-[0.875rem] text-graphite placeholder:text-grey-600",
              "transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-violet/60",
              state.message && !state.ok
                ? "border-soldout/60"
                : "border-white/15 focus:border-violet-soft",
            )}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className={cn(
            "gd-chamfer inline-flex h-12 shrink-0 items-center justify-center gap-2 px-6",
            "gd-display text-small font-bold tracking-[0.08em]",
            "border border-white/15 text-grey-600",
            "transition-[background-color,color,border-color] duration-200",
            "hover:border-violet-soft hover:text-violet-soft",
            "disabled:cursor-wait disabled:opacity-60",
          )}
        >
          {pending ? "Registrazione…" : "Avvisami"}
        </button>
      </div>

      {state.message && !state.ok ? (
        <p
          id={`${emailId}-error`}
          role="alert"
          className="text-[0.75rem] font-bold text-soldout"
        >
          {state.message}
        </p>
      ) : null}

      <p className="text-[0.6875rem] text-grey-600">
        Usiamo la tua email solo per questo avviso.{" "}
        <Link href="/legale/privacy" className="underline hover:text-graphite">
          Privacy
        </Link>
        .
      </p>
    </form>
  );
}
