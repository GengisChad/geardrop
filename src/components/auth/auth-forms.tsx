"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import {
  loginAction,
  newPasswordAction,
  recoverAction,
  registerAction,
} from "@/app/(storefront)/account/auth-actions";
import { EMPTY_AUTH_STATE, type AuthFormState } from "@/lib/auth/customer-schemas";

const FIELD =
  "gd-glass-compact h-12 w-full rounded-2xl px-4 text-small text-graphite placeholder:text-grey-600 focus:border-violet focus:outline-none disabled:opacity-60";

function SubmitButton({ label, pendingLabel }: { readonly label: string; readonly pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="gd-display gd-glass-interactive h-12 w-full rounded-2xl bg-violet px-6 text-small font-bold tracking-wider text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

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

export function LoginForm() {
  const [state, action] = useActionState(loginAction, EMPTY_AUTH_STATE);
  const params = useSearchParams();
  const next = params.get("next");
  const linkExpired = params.get("errore") === "link";

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="login-form">
      {linkExpired ? (
        <p role="status" className="rounded-2xl bg-red-50 px-4 py-3 text-small text-red-700">
          Il link non è più valido. Accedi o richiedi un nuovo link.
        </p>
      ) : null}
      <Feedback state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <label className="flex flex-col gap-1.5">
        <span className="gd-display text-[0.6875rem] font-bold tracking-wider text-grey-600">EMAIL</span>
        <input name="email" type="email" autoComplete="email" required className={FIELD} placeholder="tu@esempio.it" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="gd-display text-[0.6875rem] font-bold tracking-wider text-grey-600">PASSWORD</span>
        <input name="password" type="password" autoComplete="current-password" required className={FIELD} />
      </label>

      <SubmitButton label="ACCEDI" pendingLabel="ACCESSO IN CORSO…" />

      <div className="flex flex-wrap justify-between gap-2 text-small text-grey-600">
        <Link href="/password-dimenticata" className="underline hover:text-violet">
          Password dimenticata?
        </Link>
        <Link href="/registrati" className="underline hover:text-violet">
          Crea un account
        </Link>
      </div>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, EMPTY_AUTH_STATE);

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="register-form">
      <Feedback state={state} />

      <label className="flex flex-col gap-1.5">
        <span className="gd-display text-[0.6875rem] font-bold tracking-wider text-grey-600">NOME (FACOLTATIVO)</span>
        <input name="displayName" type="text" autoComplete="name" className={FIELD} placeholder="Come ti chiamiamo" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="gd-display text-[0.6875rem] font-bold tracking-wider text-grey-600">EMAIL</span>
        <input name="email" type="email" autoComplete="email" required className={FIELD} placeholder="tu@esempio.it" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="gd-display text-[0.6875rem] font-bold tracking-wider text-grey-600">PASSWORD</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={FIELD}
        />
        <span className="text-[0.6875rem] text-grey-600">Almeno 8 caratteri.</span>
      </label>

      <SubmitButton label="CREA ACCOUNT" pendingLabel="CREAZIONE IN CORSO…" />

      <p className="text-small text-grey-600">
        Hai già un account?{" "}
        <Link href="/login" className="underline hover:text-violet">
          Accedi
        </Link>
      </p>
    </form>
  );
}

export function RecoverForm() {
  const [state, action] = useActionState(recoverAction, EMPTY_AUTH_STATE);

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="recover-form">
      <Feedback state={state} />

      <label className="flex flex-col gap-1.5">
        <span className="gd-display text-[0.6875rem] font-bold tracking-wider text-grey-600">EMAIL</span>
        <input name="email" type="email" autoComplete="email" required className={FIELD} placeholder="tu@esempio.it" />
      </label>

      <SubmitButton label="INVIA LINK" pendingLabel="INVIO IN CORSO…" />

      <p className="text-small text-grey-600">
        <Link href="/login" className="underline hover:text-violet">
          Torna all&apos;accesso
        </Link>
      </p>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState(newPasswordAction, EMPTY_AUTH_STATE);

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="new-password-form">
      <Feedback state={state} />

      <label className="flex flex-col gap-1.5">
        <span className="gd-display text-[0.6875rem] font-bold tracking-wider text-grey-600">NUOVA PASSWORD</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={8} className={FIELD} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="gd-display text-[0.6875rem] font-bold tracking-wider text-grey-600">CONFERMA PASSWORD</span>
        <input
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={FIELD}
        />
      </label>

      <SubmitButton label="SALVA PASSWORD" pendingLabel="SALVATAGGIO…" />
    </form>
  );
}
