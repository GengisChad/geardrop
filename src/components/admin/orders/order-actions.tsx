"use client";

import { useActionState, useState } from "react";
import {
  addOrderNoteAction,
  messageCustomerAction,
  cancelOrderAction,
  prepareOrderRefundAction,
  refundStripeAction,
  setOrderTrackingAction,
  shipOrderAction,
  transitionOrderAction,
  type OrderActionState,
} from "@/app/admin/actions/orders";
import { allowedOrderTransitions, type OrderStatus, type PaymentStatus } from "@/lib/admin/orders";
import { CARRIERS, carrierByLabel } from "@/lib/orders/carriers";
import type { StaffRole } from "@/lib/auth/roles";
import styles from "./orders.module.css";

const initial: OrderActionState = { ok: false, message: "" };
const labels: Record<OrderStatus, string> = { pending: "In attesa", confirmed: "Confermato", processing: "In lavorazione", shipped: "Spedito", completed: "Completato", cancelled: "Annullato" };

function Feedback({ state }: { readonly state: OrderActionState }) {
  return state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null;
}

export function OrderActions({ orderId, status, paymentStatus, role, tracking, shippingNotifiedAt, stripePaymentIntentId, totalCents, refundedCents = 0 }: {
  readonly orderId: number; readonly status: OrderStatus; readonly paymentStatus: PaymentStatus; readonly role: StaffRole;
  readonly tracking: { readonly carrier: string | null; readonly code: string | null; readonly url: string | null };
  readonly shippingNotifiedAt: string | null;
  readonly stripePaymentIntentId: string | null;
  readonly totalCents: number;
  readonly refundedCents?: number;
}) {
  const manager = role === "owner" || role === "admin";
  const transitions = allowedOrderTransitions(status).filter((value) => value !== "cancelled") as readonly ("confirmed" | "processing" | "shipped" | "completed")[];
  const cancellable = manager && ["pending", "confirmed", "processing"].includes(status);
  const refundable = manager && ["authorized", "paid"].includes(paymentStatus);
  const stripeRefundable = refundable && Boolean(stripePaymentIntentId) && totalCents - refundedCents > 0;
  const shippable = manager && ["confirmed", "processing", "shipped"].includes(status);
  const [shipState, shipAction, shipPending] = useActionState(shipOrderAction, initial);
  const [transitionState, transitionAction, transitionPending] = useActionState(transitionOrderAction, initial);
  const [trackingState, trackingAction, trackingPending] = useActionState(setOrderTrackingAction, initial);
  const [noteState, noteAction, notePending] = useActionState(addOrderNoteAction, initial);
  const [messageState, messageAction, messagePending] = useActionState(messageCustomerAction, initial);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelOrderAction, initial);
  const [refundState, refundAction, refundPending] = useActionState(prepareOrderRefundAction, initial);
  const [stripeRefundState, stripeRefundAction, stripeRefundPending] = useActionState(refundStripeAction, initial);
  // A new id after each completed refund, so a second partial refund is never mistaken for a retry.
  const [refundAttempt, setRefundAttempt] = useState(() => crypto.randomUUID());
  const [seenRefundState, setSeenRefundState] = useState(stripeRefundState);
  if (seenRefundState !== stripeRefundState) {
    setSeenRefundState(stripeRefundState);
    if (stripeRefundState.ok) setRefundAttempt(crypto.randomUUID());
  }
  const refundable_cents = Math.max(totalCents - refundedCents, 0);

  return <div className={styles.actionGrid}>
    {shippable ? <form action={shipAction} className={`${styles.actionCard} ${styles.shipCard}`}>
      <h3>{status === "shipped" ? "Spedizione e email al cliente" : "Spedisci e avvisa il cliente"}</h3>
      <p>{shippingNotifiedAt
        ? `Email di spedizione già inviata il ${new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(shippingNotifiedAt))}.`
        : "Segna l'ordine come spedito e manda al cliente corriere, codice e link per seguire il pacco."}</p>
      <input name="orderId" type="hidden" value={orderId}/>
      <label>Corriere<select defaultValue={carrierByLabel(tracking.carrier)?.id ?? "poste"} name="carrierId" required>{CARRIERS.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.label}</option>)}</select></label>
      <label>Codice di tracciamento<input autoComplete="off" defaultValue={tracking.code ?? ""} inputMode="text" maxLength={240} name="code" placeholder="Es. 018207900244"/></label>
      <label>Link di tracciamento (solo se il corriere è “Altro”)<input defaultValue={carrierByLabel(tracking.carrier)?.trackingUrl ? "" : tracking.url ?? ""} name="url" placeholder="https://" type="url"/></label>
      <label className={styles.confirm}><input defaultChecked={!shippingNotifiedAt} name="notify" type="checkbox"/> Invia l’email al cliente</label>
      <button disabled={shipPending} type="submit">{shipPending ? "Invio…" : status === "shipped" ? "Aggiorna" : "Spedisci"}</button><Feedback state={shipState}/>
    </form> : null}

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

    <form action={messageAction} className={styles.actionCard}>
      <h3>Scrivi al cliente</h3><p>Manda un&rsquo;email dal negozio a chi ha fatto l&rsquo;ordine. Resta scritta anche nelle note.</p>
      <input name="orderId" type="hidden" value={orderId}/>
      <label>Oggetto<input maxLength={120} minLength={3} name="subject" placeholder="Es. Suppress Superion è tornato disponibile" required type="text"/></label>
      <label>Messaggio<textarea maxLength={2000} minLength={10} name="message" required rows={6}/></label>
      <label className={styles.confirm}><input name="confirmed" required type="checkbox"/> Confermo l&rsquo;invio al cliente</label>
      <button disabled={messagePending} type="submit">{messagePending ? "Invio…" : "Invia email"}</button><Feedback state={messageState}/>
    </form>

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

    {stripeRefundable ? <form action={stripeRefundAction} className={`${styles.actionCard} ${styles.dangerCard}`}>
      <h3>Rimborsa su Stripe</h3>
      <p>Esegue il rimborso direttamente su Stripe. Operazione irreversibile.</p>
      <input name="orderId" type="hidden" value={orderId}/>
      <input name="attempt" type="hidden" value={refundAttempt}/>
      <label>Importo EUR (max {(refundable_cents / 100).toFixed(2)})<input defaultValue={(refundable_cents / 100).toFixed(2)} key={refundAttempt} max={(refundable_cents / 100).toFixed(2)} min="0.01" name="amount" required step="0.01" type="number"/></label>
      <label>Messaggio al cliente (arriva così com&rsquo;è nell&rsquo;email di rimborso)<textarea maxLength={1000} minLength={3} name="reason" placeholder="Spiega al cliente perché lo rimborsi" required rows={5}/></label>
      {["pending","confirmed","processing"].includes(status) ? <label className={styles.confirm}><input name="restoreStock" type="checkbox"/> Annulla l&rsquo;ordine e rimetti i pezzi a magazzino</label> : null}
      <label className={styles.confirm}><input defaultChecked name="notifyCustomer" type="checkbox"/> Invia l&rsquo;email di rimborso al cliente</label>
      <label className={styles.confirm}><input name="alreadyRefunded" type="checkbox"/> L&rsquo;ho già rimborsato io dalla dashboard di Stripe: registralo e avvisa il cliente, senza rimborsare di nuovo</label>
      <label className={styles.confirm}><input name="confirmed" required type="checkbox"/> Confermo il rimborso su Stripe</label>
      <button disabled={stripeRefundPending} type="submit">{stripeRefundPending ? "Rimborso…" : "Rimborsa su Stripe"}</button><Feedback state={stripeRefundState}/>
    </form> : null}

    {cancellable ? <form action={cancelAction} className={`${styles.actionCard} ${styles.dangerCard}`}>
      <h3>Annulla ordine</h3><p>Operazione transazionale: ripristina lo stock una sola volta.</p><input name="orderId" type="hidden" value={orderId}/>
      <label>Motivazione<textarea maxLength={1000} minLength={1} name="note" required rows={3}/></label>
      <label className={styles.confirm}><input name="confirmed" required type="checkbox"/> Confermo l’annullamento</label>
      <button disabled={cancelPending} type="submit">{cancelPending ? "Annullamento…" : "Annulla e ripristina stock"}</button><Feedback state={cancelState}/>
    </form> : null}
  </div>;
}
