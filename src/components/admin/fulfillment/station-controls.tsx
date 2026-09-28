"use client";

import { useActionState } from "react";
import { transitionOrderAction } from "@/app/admin/actions/orders";
import styles from "./fulfillment.module.css";

const initial = { ok: false, message: "" };

/** Takes a new order into work: the order moves to "in lavorazione" and leaves the new ones. */
export function ClaimOrderButton({ orderId }: { readonly orderId: number }) {
  const [state, action, pending] = useActionState(transitionOrderAction, initial);
  return (
    <form action={action} className={styles.orderActions}>
      <input name="orderId" type="hidden" value={orderId} />
      <input name="toStatus" type="hidden" value="processing" />
      <button className={styles.primary} disabled={pending} type="submit">{pending ? "Presa in carico…" : "Prendi in carico"}</button>
      {state.message && !state.ok ? <p className={styles.feedback} data-error role="status">{state.message}</p> : null}
    </form>
  );
}

export function PrintButton() {
  return (
    <button className={styles.primary} onClick={() => window.print()} type="button">
      Stampa
    </button>
  );
}
