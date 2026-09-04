"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { AdminFormState } from "@/app/admin/actions";

const EMPTY: AdminFormState = {};

export type AdminAction = (state: AdminFormState, formData: FormData) => Promise<AdminFormState>;

function Submit({ label, variant }: { label: string; variant: ButtonVariant }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
}

/**
 * Thin wrapper around a back-office Server Action: renders the fields, the submit button
 * and whatever the action reported. Every mutating control in /admin goes through one of
 * these, so the feedback and the pending state look the same everywhere.
 */
export function AdminForm({
  action,
  children,
  submitLabel,
  variant = "tertiary",
  className,
}: {
  action: AdminAction;
  children?: ReactNode;
  submitLabel: string;
  variant?: ButtonVariant;
  className?: string;
}) {
  const [state, dispatch] = useActionState(action, EMPTY);

  return (
    <form action={dispatch} className={cn("flex flex-col gap-3", className)}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Submit label={submitLabel} variant={variant} />
        {state.error ? (
          <span role="alert" className="text-[0.6875rem] text-soldout">
            {state.error}
          </span>
        ) : null}
        {state.notice ? (
          <span role="status" className="text-[0.6875rem] text-violet-ink">
            {state.notice}
          </span>
        ) : null}
      </div>
    </form>
  );
}

/** Compact labelled control used inside the dense admin tables. */
export function AdminField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="gd-display text-[0.625rem] font-bold uppercase tracking-wider text-grey-600">{label}</span>
      {children}
    </label>
  );
}

export const adminControlClass =
  "h-9 w-full rounded-lg border border-grey-300 bg-white px-2.5 text-small text-graphite focus:border-violet focus:outline-none";
