"use client";

import { useActionState } from "react";
import { markSupplierOrderAction, type ReturnActionState } from "@/app/admin/actions/returns";
import styles from "./warehouse.module.css";

const initial: ReturnActionState = { ok: false, message: "" };
const date = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" });

/**
 * "Ordine al fornitore" on a receipt draft: once the draft is sent to the supplier it is marked
 * as ordered, with the day the goods are expected, and shows in "In arrivo" until it is loaded.
 */
export function SupplierOrderCard({
  receiptId,
  orderedAt,
  expectedOn,
}: {
  readonly receiptId: number;
  readonly orderedAt: string | null;
  readonly expectedOn: string | null;
}) {
  const [state, action, pending] = useActionState(markSupplierOrderAction, initial);
  return (
    <section className={styles.panel} aria-labelledby="supplier-order-title">
      <h2 id="supplier-order-title">Ordine al fornitore</h2>
      {orderedAt ? (
        <p className={styles.hint}>
          Ordinato il {date.format(new Date(orderedAt))}
          {expectedOn ? ` · arrivo previsto ${date.format(new Date(`${expectedOn}T12:00:00Z`))}` : " · arrivo non indicato"}. Quando la merce
          arriva, controlla le righe e premi &ldquo;Carica in magazzino&rdquo;.
        </p>
      ) : (
        <p className={styles.hint}>Hai mandato questa bozza al fornitore? Segnala come ordinata: comparirà tra la merce in arrivo.</p>
      )}
      <form action={action} className={styles.actions}>
        <input name="receiptId" type="hidden" value={receiptId} />
        <input name="ordered" type="hidden" value="si" />
        <label>
          Arrivo previsto
          <input defaultValue={expectedOn ?? ""} name="expectedOn" type="date" />
        </label>
        <button disabled={pending} type="submit">
          {pending ? "Salvo…" : orderedAt ? "Aggiorna arrivo" : "Segna come ordinato"}
        </button>
      </form>
      {orderedAt ? (
        <form action={action}>
          <input name="receiptId" type="hidden" value={receiptId} />
          <input name="ordered" type="hidden" value="no" />
          <input name="expectedOn" type="hidden" value="" />
          <button disabled={pending} type="submit">
            Non è più ordinato
          </button>
        </form>
      ) : null}
      {state.message ? (
        <p className={state.ok ? styles.success : styles.error} role="status">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
