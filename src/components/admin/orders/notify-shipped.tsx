"use client";

import { useActionState } from "react";
import {
  notifyDeliveredOrdersAction,
  notifyShippedOrdersAction,
  type OrderActionState,
} from "@/app/admin/actions/orders";
import styles from "./orders.module.css";

const initial: OrderActionState = { ok: false, message: "" };

type Bar = {
  readonly action: (previous: OrderActionState, formData: FormData) => Promise<OrderActionState>;
  readonly count: number;
  readonly testId: string;
  readonly one: string;
  readonly many: (count: number) => string;
  readonly cta: string;
};

/** One tap emails every order of a kind that has not been told yet; hidden when none is waiting. */
function NotifyBar({ action: serverAction, count, testId, one, many, cta }: Bar) {
  const [state, action, pending] = useActionState(serverAction, initial);
  if (count === 0 && !state.message) return null;

  return (
    <form action={action} className={styles.notifyBar} data-testid={testId}>
      <p>{count === 1 ? one : many(count)}</p>
      {count > 0 ? (
        <button disabled={pending} type="submit">
          {pending ? "Invio in corso…" : cta}
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

/** On the orders list: the shipped orders whose buyer has not had the shipping email. */
export function NotifyShippedOrders({ count }: { readonly count: number }) {
  return (
    <NotifyBar
      action={notifyShippedOrdersAction}
      count={count}
      cta="Avvisa i clienti"
      many={(value) => `${value} ordini spediti non hanno ancora ricevuto l’email di spedizione.`}
      one="1 ordine spedito non ha ancora ricevuto l’email di spedizione."
      testId="notify-shipped"
    />
  );
}

/** On the orders list: the delivered orders whose buyer has not had the arrival confirmation. */
export function NotifyDeliveredOrders({ count }: { readonly count: number }) {
  return (
    <NotifyBar
      action={notifyDeliveredOrdersAction}
      count={count}
      cta="Conferma la consegna"
      many={(value) => `${value} ordini consegnati non hanno ancora ricevuto l’email di consegna.`}
      one="1 ordine consegnato non ha ancora ricevuto l’email di consegna."
      testId="notify-delivered"
    />
  );
}
