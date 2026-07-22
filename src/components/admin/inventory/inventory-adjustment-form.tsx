"use client";

import { useActionState } from "react";
import { adjustInventoryAction, type InventoryActionState } from "@/app/admin/actions/inventory";
import styles from "./inventory.module.css";

const initialState: InventoryActionState = { ok: false, message: "" };

export function InventoryAdjustmentForm() {
  const [state, action, pending] = useActionState(adjustInventoryAction, initialState);
  return <form action={action} className={styles.adjustmentForm}>
    <header><p>Mutazione auditata</p><h2>Registra movimento</h2><span>Lo stock cambia solo tramite la funzione atomica adjust_inventory().</span></header>
    <label>SKU<input autoComplete="off" name="sku" placeholder="es. starter-blade" required /></label>
    <label>Variazione<input inputMode="numeric" max={100000} min={-100000} name="delta" placeholder="+5 o -2" required type="number" /></label>
    <label>Causale<select defaultValue="manual_adjustment" name="reason"><option value="manual_adjustment">Rettifica manuale</option><option value="return">Reso</option><option value="damage">Danneggiamento</option></select></label>
    <label className={styles.note}>Nota<textarea maxLength={500} name="note" placeholder="Contesto operativo facoltativo" rows={3} /></label>
    <label className={styles.confirm}><input name="confirmReduction" type="checkbox" />Confermo riduzioni pari o superiori a 10 unità</label>
    <button disabled={pending} type="submit">{pending ? "Registrazione…" : "Registra movimento"}</button>
    {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
  </form>;
}
