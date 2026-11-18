"use client";

import { useActionState } from "react";
import { recordOrderReturnAction, type ReturnActionState } from "@/app/admin/actions/returns";
import type { ReturnableLine } from "@/lib/admin/returns";
import styles from "./orders.module.css";

const initial: ReturnActionState = { ok: false, message: "" };

/**
 * "Registra reso" (owner, 2026-11-18): how many pieces of each product came back and whether
 * they can be sold again. Sellable pieces go back into stock; damaged ones are recorded without
 * moving it. The refund stays a separate step ("Rimborsa").
 */
export function ReturnPanel({ orderId, lines }: { readonly orderId: number; readonly lines: readonly ReturnableLine[] }) {
  const [state, action, pending] = useActionState(recordOrderReturnAction, initial);
  const open = lines.filter((line) => line.sold > line.returned);

  return (
    <form action={action} className={styles.actionCard} data-testid="return-panel">
      <h3>Registra reso</h3>
      <p>Scrivi quanti pezzi sono tornati. Se sono integri tornano in vendita, se sono rovinati restano registrati come non vendibili.</p>
      <input name="orderId" type="hidden" value={orderId} />
      {open.length === 0 ? <p>Tutti i pezzi di questo ordine sono già rientrati.</p> : null}
      {open.map((line) => {
        const left = line.sold - line.returned;
        return (
          <fieldset key={line.productId}>
            <legend>
              {line.name} · venduti {line.sold}
              {line.returned > 0 ? `, già resi ${line.returned}` : ""}
            </legend>
            <label>
              Pezzi tornati
              <input defaultValue="" inputMode="numeric" max={left} min={0} name={`qty-${line.productId}`} type="number" />
            </label>
            <label>
              Stato
              <select defaultValue="vendibile" name={`condition-${line.productId}`}>
                <option value="vendibile">Integro: torna in vendita</option>
                <option value="danneggiato">Rovinato: non vendibile</option>
              </select>
            </label>
          </fieldset>
        );
      })}
      {open.length > 0 ? (
        <>
          <label>
            Nota (facoltativa)
            <input maxLength={500} name="note" placeholder="Motivo del reso" />
          </label>
          <button disabled={pending} type="submit">
            {pending ? "Registro…" : "Registra reso"}
          </button>
        </>
      ) : null}
      {state.message ? (
        <p className={state.ok ? styles.success : undefined} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
