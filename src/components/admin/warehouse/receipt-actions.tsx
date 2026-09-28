"use client";

import { useActionState } from "react";
import {
  confirmReceiptAction,
  deleteReceiptDraftAction,
  reverseReceiptAction,
  type WarehouseActionState,
} from "@/app/admin/actions/warehouse";
import styles from "./warehouse.module.css";

const initial: WarehouseActionState = { ok: false, message: "" };

/** Loads a draft into the warehouse. Typing CARICA is the confirmation: it cannot be edited after. */
export function ConfirmReceiptForm({ receiptId }: { readonly receiptId: number }) {
  const [state, action, pending] = useActionState(confirmReceiptAction, initial);
  return (
    <form action={action} className={`${styles.panel} ${styles.form}`} data-testid="confirm-receipt">
      <input name="receiptId" type="hidden" value={receiptId} />
      <header className={styles.wide}>
        <div>
          <p>Carico in magazzino</p>
          <h2>Conferma il documento</h2>
          <span>La merce entra in giacenza al costo a magazzino di ogni riga e il costo medio si aggiorna. Dopo si può solo stornare.</span>
        </div>
      </header>
      <label>
        Scrivi CARICA
        <input autoComplete="off" name="confirmation" required />
      </label>
      <div className={styles.actions}>
        <button className={styles.primary} disabled={pending} type="submit">{pending ? "Carico…" : "Carica in magazzino"}</button>
        {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
      </div>
    </form>
  );
}

export function DeleteReceiptDraftForm({ receiptId }: { readonly receiptId: number }) {
  return (
    <form action={deleteReceiptDraftAction}>
      <input name="receiptId" type="hidden" value={receiptId} />
      <button className={styles.danger} type="submit">Elimina bozza</button>
    </form>
  );
}

/** Takes a confirmed document's goods back out, at the cost they came in with. */
export function ReverseReceiptForm({ receiptId }: { readonly receiptId: number }) {
  const [state, action, pending] = useActionState(reverseReceiptAction, initial);
  return (
    <form action={action} className={`${styles.panel} ${styles.form}`} data-testid="reverse-receipt">
      <input name="receiptId" type="hidden" value={receiptId} />
      <header className={styles.wide}>
        <div>
          <p>Correzione</p>
          <h2>Storna il documento</h2>
          <span>Toglie dal magazzino i pezzi caricati, al loro costo di carico. Non si può se sono già stati venduti.</span>
        </div>
      </header>
      <label className={styles.wide}>
        Motivo
        <input maxLength={500} minLength={3} name="reason" placeholder="Es. merce resa al fornitore, documento caricato due volte" required />
      </label>
      <div className={styles.actions}>
        <button className={styles.danger} disabled={pending} type="submit">{pending ? "Storno…" : "Storna documento"}</button>
        {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
      </div>
    </form>
  );
}
