"use client";

import { useActionState } from "react";
import { changePasswordAction, type AccountActionState } from "@/app/admin/actions/account";
import styles from "@/components/admin/warehouse/warehouse.module.css";

const initial: AccountActionState = { ok: false, message: "" };

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);
  return (
    <form action={action} className={`${styles.panel} ${styles.form}`} data-testid="change-password">
      <header className={styles.wide}>
        <div>
          <p>Sicurezza</p>
          <h2>Cambia password</h2>
          <span>Almeno 10 caratteri. Vale su tutti i dispositivi da cui accedi.</span>
        </div>
      </header>
      <label>
        Nuova password
        <input autoComplete="new-password" maxLength={128} minLength={10} name="password" required type="password" />
      </label>
      <label>
        Ripeti la nuova password
        <input autoComplete="new-password" maxLength={128} minLength={10} name="confirmation" required type="password" />
      </label>
      <div className={styles.actions}>
        <button className={styles.primary} disabled={pending} type="submit">{pending ? "Aggiornamento…" : "Aggiorna password"}</button>
        {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
      </div>
    </form>
  );
}
