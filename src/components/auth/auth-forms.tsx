"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import {
  loginAction,
  recoverAction,
  registerAction,
  updatePasswordAction,
} from "@/app/auth/actions";
import type { AuthFormState } from "@/lib/auth/schemas";

const EMPTY: AuthFormState = {};

/**
 * The forms are plain `<form action={…}>` submissions, so they work before hydration and
 * the pending state comes from `useFormStatus` rather than local state.
 */
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth disabled={pending}>
      {pending ? "Attendi…" : label}
    </Button>
  );
}

function Feedback({ state }: { state: AuthFormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-xl bg-soldout/10 px-3.5 py-2.5 text-small text-soldout">
        {state.error}
      </p>
    );
  }
  if (state.notice) {
    return (
      <p role="status" className="rounded-xl bg-violet-tint px-3.5 py-2.5 text-small text-violet-ink">
        {state.notice}
      </p>
    );
  }
  return null;
}

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, action] = useActionState(loginAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-4">
      {redirectTo ? <input type="hidden" name="redirect" value={redirectTo} /> : null}
      <Feedback state={state} />
      <Field label="Email" htmlFor="email">
        <TextInput id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password">
        <TextInput id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Submit label="Accedi" />
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="firstName">
          <TextInput id="firstName" name="firstName" autoComplete="given-name" required />
        </Field>
        <Field label="Cognome" htmlFor="lastName">
          <TextInput id="lastName" name="lastName" autoComplete="family-name" required />
        </Field>
      </div>
      <Field label="Email" htmlFor="email">
        <TextInput id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password">
        <TextInput id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Submit label="Crea account" />
    </form>
  );
}

export function RecoverForm() {
  const [state, action] = useActionState(recoverAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Feedback state={state} />
      <Field label="Email" htmlFor="email">
        <TextInput id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Submit label="Invia il link" />
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState(updatePasswordAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Feedback state={state} />
      <Field label="Nuova password" htmlFor="password">
        <TextInput id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Conferma password" htmlFor="confirm">
        <TextInput id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Submit label="Aggiorna password" />
    </form>
  );
}
