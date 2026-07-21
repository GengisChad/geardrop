"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateProfileAction } from "@/app/(storefront)/account/auth-actions";
import { EMPTY_AUTH_STATE } from "@/lib/auth/customer-schemas";

const FIELD =
  "gd-glass-compact h-12 w-full rounded-2xl px-4 text-small text-graphite placeholder:text-grey-600 focus:border-violet focus:outline-none disabled:opacity-60";

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-testid="profile-save"
      className="gd-display gd-glass-compact gd-glass-interactive h-11 rounded-2xl px-5 text-small font-bold tracking-wider text-graphite disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "SALVATAGGIO…" : "SALVA"}
    </button>
  );
}

export function ProfileForm({ displayName }: { readonly displayName: string }) {
  const [state, action] = useActionState(updateProfileAction, EMPTY_AUTH_STATE);

  return (
    <form action={action} className="mt-4 flex flex-col gap-3" data-testid="profile-form">
      {state.error || state.notice ? (
        <p
          role="status"
          aria-live="polite"
          className={`rounded-2xl px-4 py-2.5 text-small ${
            state.error ? "bg-red-50 text-red-700" : "bg-lime-tint text-graphite"
          }`}
        >
          {state.error ?? state.notice}
        </p>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="gd-display text-[0.6875rem] font-bold tracking-wider text-grey-600">NOME</span>
        <input name="displayName" defaultValue={displayName} maxLength={80} className={FIELD} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="gd-display text-[0.6875rem] font-bold tracking-wider text-grey-600">TELEFONO</span>
        <input name="phone" type="tel" maxLength={32} className={FIELD} placeholder="Facoltativo" />
      </label>

      <SaveButton />
    </form>
  );
}
