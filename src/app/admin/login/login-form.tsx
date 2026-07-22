"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import styles from "@/components/admin/admin.module.css";

const INITIAL_STATE: LoginState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, INITIAL_STATE);

  return (
    <form action={action} className={styles.loginForm}>
      <label>
        Email staff
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error ? (
        <p className={styles.loginError} role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending}>
        {pending ? "Accesso in corso…" : "Accedi alla console"}
      </button>
    </form>
  );
}
