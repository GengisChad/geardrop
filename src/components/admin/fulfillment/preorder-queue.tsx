"use client";

import Link from "next/link";
import { useActionState } from "react";
import { notifyPreorderReadyAction } from "@/app/admin/actions/orders";
import type { PreorderWait } from "@/lib/admin/fulfillment-repository";
import styles from "./fulfillment.module.css";

const initial = { ok: false, message: "" };
const date = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeZone: "Europe/Rome" });

/**
 * Chi ha pagato un pre-ordine e aspetta la merce. Finché il magazzino non copre i suoi pezzi
 * l'ordine non è preparabile: resta qui, fuori dalla coda di chi si può spedire oggi. Quando la
 * merce arriva, il pulsante avvisa il cliente una volta sola.
 */
function WaitingOrder({ wait }: { readonly wait: PreorderWait }) {
  const [state, action, pending] = useActionState(notifyPreorderReadyAction, initial);
  return (
    <article className={styles.order} data-testid="preorder-wait" data-waiting={wait.ready ? undefined : true}>
      <div className={styles.orderHead}>
        <span>
          <Link href={`/admin/ordini/${wait.orderId}`}>{wait.orderNumber}</Link>
          <small>{date.format(new Date(wait.createdAt))} · {wait.preorderUnits} pz attesi</small>
        </span>
        <span className={styles.badge} data-tone={wait.ready ? "active" : "warning"}>
          {wait.ready ? "Merce arrivata" : `${wait.coveredUnits} di ${wait.preorderUnits} coperti`}
        </span>
      </div>
      <ul className={styles.lines}>
        {wait.lines.map((line, index) => (
          <li key={`${line.sku}-${index}`}>
            <span />
            <span>{line.name}<small>{line.sku}</small></span>
            <strong>{line.covered} / {line.expected}</strong>
          </li>
        ))}
      </ul>
      {wait.notifiedAt ? (
        <p className={styles.destination}>Cliente avvisato il {date.format(new Date(wait.notifiedAt))}. Ora si può spedire.</p>
      ) : wait.ready ? (
        <form action={action} className={styles.orderActions}>
          <input name="orderId" type="hidden" value={wait.orderId} />
          <button className={styles.primary} disabled={pending} type="submit">
            {pending ? "Invio…" : "Avvisa che è arrivato"}
          </button>
          <Link className={styles.secondary} href={`/admin/ordini/${wait.orderId}`}>Spedisci</Link>
        </form>
      ) : (
        <p className={styles.destination}>Si avvisa il cliente quando il carico merce porta i pezzi mancanti.</p>
      )}
      {state.message ? <p className={styles.feedback} data-error={state.ok ? undefined : true} role="status">{state.message}</p> : null}
    </article>
  );
}

export function PreorderQueue({ waits }: { readonly waits: readonly PreorderWait[] }) {
  const ready = waits.filter((wait) => wait.ready && !wait.notifiedAt);
  return (
    <section className={styles.column} aria-labelledby="attesa-title" data-testid="preorder-queue">
      <h2 id="attesa-title">In attesa di merce · {waits.length}</h2>
      <p>
        Pre-ordini pagati: partono quando la merce arriva.
        {ready.length > 0 ? ` ${ready.length} da avvisare adesso.` : ""}
      </p>
      {waits.map((wait) => <WaitingOrder key={wait.orderId} wait={wait} />)}
    </section>
  );
}
