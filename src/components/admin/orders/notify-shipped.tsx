"use client";

import { useActionState } from "react";
import { notifyShippedOrdersAction, type OrderActionState } from "@/app/admin/actions/orders";
import styles from "./orders.module.css";

const initial: OrderActionState = { ok: false, message: "" };

/** On the orders list: one tap emails every shipped order that has not been told yet. */
export function NotifyShippedOrders({ count }: { readonly count: number }) {
  const [state, action, pending] = useActionState(notifyShippedOrdersAction, initial);
  if (count === 0 && !state.message) return null;

  return (
    <form action={action} className={styles.notifyBar} data-testid="notify-shipped">
      <p>
        {count === 1
          ? "1 ordine spedito non ha ancora ricevuto l’email di spedizione."
          : `${count} ordini spediti non hanno ancora ricevuto l’email di spedizione.`}
      </p>
      {count > 0 ? (
        <button disabled={pending} type="submit">
          {pending ? "Invio in corso…" : "Avvisa i clienti"}
        </button>
      ) : null}
      {state.message ? (
        <p className={state.ok ? styles.success : styles.error} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
