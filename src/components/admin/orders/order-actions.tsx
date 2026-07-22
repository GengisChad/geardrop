"use client";

import { useActionState } from "react";
import {
  addOrderNoteAction,
  cancelOrderAction,
  prepareOrderRefundAction,
  setOrderTrackingAction,
  transitionOrderAction,
  type OrderActionState,
} from "@/app/admin/actions/orders";
import { allowedOrderTransitions, type OrderStatus, type PaymentStatus } from "@/lib/admin/orders";
import type { StaffRole } from "@/lib/auth/roles";
import styles from "./orders.module.css";

const initial: OrderActionState = { ok: false, message: "" };
const labels: Record<OrderStatus, string> = { pending: "In attesa", confirmed: "Confermato", processing: "In lavorazione", shipped: "Spedito", completed: "Completato", cancelled: "Annullato" };

function Feedback({ state }: { readonly state: OrderActionState }) {
  return state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null;
}

export function OrderActions({ orderId, status, paymentStatus, role, tracking }: {
  readonly orderId: number; readonly status: OrderStatus; readonly paymentStatus: PaymentStatus; readonly role: StaffRole;
  readonly tracking: { readonly carrier: string | null; readonly code: string | null; readonly url: string | null };
}) {
  const manager = role === "owner" || role === "admin";
  const transitions = allowedOrderTransitions(status).filter((value) => value !== "cancelled") as readonly ("confirmed" | "processing" | "shipped" | "completed")[];
  const cancellable = manager && ["pending", "confirmed", "processing"].includes(status);
  const refundable = manager && ["authorized", "paid"].includes(paymentStatus);
  const [transitionState, transitionAction, transitionPending] = useActionState(transitionOrderAction, initial);
  const [trackingState, trackingAction, trackingPending] = useActionState(setOrderTrackingAction, initial);
  const [noteState, noteAction, notePending] = useActionState(addOrderNoteAction, initial);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelOrderAction, initial);
  const [refundState, refundAction, refundPending] = useActionState(prepareOrderRefundAction, initial);

  return <div className={styles.actionGrid}>
    {manager && transitions.length > 0 ? <form action={transitionAction} className={styles.actionCard}>
      <h3>Avanza stato</h3><input name="orderId" type="hidden" value={orderId}/>
      <label>Nuovo stato<select name="toStatus" required>{transitions.map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
      <label>Nota operativa<textarea maxLength={1000} name="note" rows={3}/></label>
      <button disabled={transitionPending} type="submit">{transitionPending ? "Aggiornamento…" : "Aggiorna stato"}</button><Feedback state={transitionState}/>
    </form> : null}

    {manager ? <form action={trackingAction} className={styles.actionCard}>
      <h3>Tracking</h3><input name="orderId" type="hidden" value={orderId}/>
      <label>Corriere<input defaultValue={tracking.carrier ?? ""} maxLength={120} name="carrier" required/></label>
      <label>Codice<input defaultValue={tracking.code ?? ""} maxLength={240} name="code" required/></label>
      <label>URL HTTPS<input defaultValue={tracking.url ?? ""} name="url" type="url"/></label>
      <button disabled={trackingPending} type="submit">{trackingPending ? "Salvataggio…" : "Salva tracking"}</button><Feedback state={trackingState}/>
    </form> : null}

    <form action={noteAction} className={styles.actionCard}>
      <h3>Nota interna</h3><input name="orderId" type="hidden" value={orderId}/>
      <label>Nota<textarea maxLength={4000} name="note" required rows={5}/></label>
      <button disabled={notePending} type="submit">{notePending ? "Aggiunta…" : "Aggiungi nota"}</button><Feedback state={noteState}/>
    </form>

    {refundable ? <form action={refundAction} className={styles.actionCard}>
      <h3>Prepara rimborso</h3><p>Registra la richiesta. Nessuna chiamata Stripe viene eseguita.</p><input name="orderId" type="hidden" value={orderId}/>
      <label>Importo EUR<input min="0.01" name="amount" required step="0.01" type="number"/></label>
      <label>Motivazione<textarea maxLength={1000} minLength={3} name="reason" required rows={3}/></label>
      <button disabled={refundPending} type="submit">{refundPending ? "Preparazione…" : "Prepara rimborso"}</button><Feedback state={refundState}/>
    </form> : null}

    {cancellable ? <form action={cancelAction} className={`${styles.actionCard} ${styles.dangerCard}`}>
      <h3>Annulla ordine</h3><p>Operazione transazionale: ripristina lo stock una sola volta.</p><input name="orderId" type="hidden" value={orderId}/>
      <label>Motivazione<textarea maxLength={1000} minLength={1} name="note" required rows={3}/></label>
      <label className={styles.confirm}><input name="confirmed" required type="checkbox"/> Confermo l’annullamento</label>
      <button disabled={cancelPending} type="submit">{cancelPending ? "Annullamento…" : "Annulla e ripristina stock"}</button><Feedback state={cancelState}/>
    </form> : null}
  </div>;
}
