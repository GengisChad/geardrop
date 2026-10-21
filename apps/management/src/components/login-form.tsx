"use client";

/**
 * Form di login del gestionale.
 * - Messaggio di errore generico identico per tutti i casi di diniego.
 * - Nessun link di registrazione.
 * - Nessun recupero password self-service (il recupero staff è gestito da un owner).
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction } from "@/app/login/actions";
import type { LoginState } from "@/app/login/actions";

const INITIAL_STATE: LoginState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Accesso in corso…" : "Accedi"}
    </button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(loginAction, INITIAL_STATE);

  return (
    <form action={action} noValidate={false}>
      {state.error ? (
        <p role="alert" aria-live="assertive">
          {state.error}
        </p>
      ) : null}
      <div>
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
        />
      </div>
      <div>
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <SubmitButton />
    </form>
  );
}
