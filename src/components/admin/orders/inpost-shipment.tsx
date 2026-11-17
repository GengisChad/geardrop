"use client";

import { useActionState, useState } from "react";
import { createInpostShipmentAction, type OrderActionState } from "@/app/admin/actions/orders";
import { LockerPicker, type PickedLocker } from "@/components/checkout/locker-picker";
import styles from "./orders.module.css";

const initial: OrderActionState = { ok: false, message: "" };

/**
 * "Crea spedizione InPost" (owner, 2026-10-23): one click makes the shipment from Gear Drop Shop
 * to the buyer's Locker, ships the order and emails the tracking. An order whose Locker was typed
 * by hand, before the search existed, gets its Locker picked here first.
 */
export function InpostShipmentCard({
  orderId,
  locker,
  itemCount,
}: {
  readonly orderId: number;
  /** The Locker on the order: InPost's id when the buyer picked it from the search. */
  readonly locker: { readonly label: string | null; readonly id: string | null };
  readonly itemCount: number;
}) {
  const [state, action, pending] = useActionState(createInpostShipmentAction, initial);
  const [picked, setPicked] = useState<PickedLocker | null>(locker.id ? { label: locker.label ?? locker.id, id: locker.id } : null);

  return (
    <form action={action} className={`${styles.actionCard} ${styles.shipCard}`}>
      <h3>Crea spedizione InPost</h3>
      <p>
        Crea la spedizione sul tuo account InPost con mittente Gear Drop Shop, segna l&rsquo;ordine come spedito e manda
        al cliente l&rsquo;email con il tracking. Poi stampa l&rsquo;etichetta e porta il pacco in un punto InPost.
      </p>
      <input name="orderId" type="hidden" value={orderId} />
      <input name="lockerId" type="hidden" value={picked?.id ?? ""} />
      <input name="lockerLabel" type="hidden" value={picked?.label ?? ""} />
      {!locker.id && locker.label ? (
        <p>
          Il cliente ha scritto: <strong>{locker.label}</strong>. Cerca lo stesso Locker e sceglilo.
        </p>
      ) : null}
      <div>
        <span>Locker di destinazione</span>
        <LockerPicker idPrefix={`admin-${orderId}`} value={picked} onChange={(value) => setPicked(value?.id ? value : null)} />
      </div>
      <label>
        Misura del vano
        <select defaultValue={itemCount > 4 ? "B" : "A"} name="size" required>
          <option value="A">A · alto fino a 8 cm</option>
          <option value="B">B · alto fino a 19 cm</option>
          <option value="C">C · alto fino a 41 cm</option>
        </select>
      </label>
      <label>
        Peso (kg)
        <input defaultValue="1" inputMode="decimal" max="25" min="0.1" name="weightKg" required step="0.1" type="number" />
      </label>
      <button disabled={pending || !picked?.id} type="submit">
        {pending ? "Creazione…" : "Crea spedizione e avvisa"}
      </button>
      {state.message ? (
        <p className={state.ok ? styles.success : styles.error} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
