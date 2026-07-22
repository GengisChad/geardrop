"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, CheckCircle2, MailQuestion } from "lucide-react";
import {
  confirmRecoveryAction,
  confirmSignupAction,
  resendConfirmationAction,
} from "@/app/(storefront)/account/confirm-actions";
import { EMPTY_AUTH_STATE, type AuthFormState } from "@/lib/auth/customer-schemas";

const FIELD =
  "gd-glass-compact h-12 w-full rounded-2xl px-4 text-small text-graphite placeholder:text-grey-600 focus:border-violet focus:outline-none disabled:opacity-60";

function Feedback({ state }: { readonly state: AuthFormState }) {
  if (!state.error && !state.notice) return null;
  const isError = Boolean(state.error);

  return (
    <p
      role="status"
      aria-live="polite"
      data-testid={isError ? "auth-error" : "auth-notice"}
      className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-small ${
        isError ? "bg-red-50 text-red-700" : "bg-lime-tint text-graphite"
      }`}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      <span>{state.error ?? state.notice}</span>
    </p>
  );
}

function ConfirmButton({ label, pendingLabel }: { readonly label: string; readonly pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-testid="confirm-button"
      className="gd-display gd-glass-interactive h-12 w-full rounded-2xl bg-violet px-6 text-small font-bold tracking-wider text-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/**
 * The explicit step between the email link and the one-time token. The page's GET does
 * nothing to the token; only this form's POST reaches verifyOtp. A mailbox scanner can
 * fetch the page all it wants — it does not press buttons.
 */
export function ConfirmSignupForm({ tokenHash }: { readonly tokenHash: string }) {
  const [state, action] = useActionState(confirmSignupAction, EMPTY_AUTH_STATE);

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="confirm-signup-form">
      <Feedback state={state} />
      <input type="hidden" name="tokenHash" value={tokenHash} />
      <ConfirmButton label="CONFERMA ACCOUNT" pendingLabel="CONFERMA IN CORSO…" />
      {state.error ? (
        <p className="text-small text-grey-600">
          <Link href="/login" className="underline hover:text-violet">
            Vai all&apos;accesso
          </Link>
        </p>
      ) : null}
    </form>
  );
}

export function ConfirmRecoveryForm({ tokenHash }: { readonly tokenHash: string }) {
  const [state, action] = useActionState(confirmRecoveryAction, EMPTY_AUTH_STATE);

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="confirm-recovery-form">
      <Feedback state={state} />
      <input type="hidden" name="tokenHash" value={tokenHash} />
      <ConfirmButton label="CONTINUA CON LA REIMPOSTAZIONE" pendingLabel="VERIFICA IN CORSO…" />
      {state.error ? (
        <p className="text-small text-grey-600">
          <Link href="/password-dimenticata" className="underline hover:text-violet">
            Richiedi un nuovo link
          </Link>
        </p>
      ) : null}
    </form>
  );
}

const RESEND_COOLDOWN_SECONDS = 60;

/** "Non hai ricevuto l'email?" — a real auth.resend, with a visible cooldown. */
export function ResendConfirmationForm() {
  const [state, action] = useActionState(resendConfirmationAction, EMPTY_AUTH_STATE);

  // The cooldown starts in the submit handler — an event, where setState belongs — and
  // an interval only ticks the clock. Every submit arms it, success and failure alike:
  // the SMTP frequency cap applies either way, so hammering the button helps nobody.
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (cooldownUntil === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  const cooldown = cooldownUntil === null ? 0 : Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  return (
    <form
      action={action}
      onSubmit={() => setCooldownUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000)}
      className="flex flex-col gap-3"
      data-testid="resend-form"
    >
      <p className="gd-display flex items-center gap-2 text-small font-bold tracking-wider text-graphite">
        <MailQuestion className="size-4 text-violet" aria-hidden="true" />
        NON HAI RICEVUTO L&apos;EMAIL?
      </p>
      <Feedback state={state} />

      <label className="flex flex-col gap-1.5">
        <span className="sr-only">Email</span>
        <input name="email" type="email" autoComplete="email" required className={FIELD} placeholder="tu@esempio.it" />
      </label>

      <ResendButton cooldown={cooldown} />
    </form>
  );
}

function ResendButton({ cooldown }: { readonly cooldown: number }) {
  const { pending } = useFormStatus();
  const blocked = pending || cooldown > 0;

  return (
    <button
      type="submit"
      disabled={blocked}
      aria-busy={pending}
      data-testid="resend-button"
      className="gd-display gd-glass-compact gd-glass-interactive h-11 rounded-2xl px-5 text-small font-bold tracking-wider text-graphite disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "INVIO…" : cooldown > 0 ? `RIPROVA TRA ${cooldown}s` : "REINVIA EMAIL"}
    </button>
  );
}
