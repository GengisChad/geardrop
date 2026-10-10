"use client";

import { useActionState } from "react";
import { importProductCostsAction, type WarehouseActionState } from "@/app/admin/actions/warehouse";
import styles from "./warehouse.module.css";

const initial: WarehouseActionState = { ok: false, message: "" };

/** Owners paste the costs of goods already on the shelf: SKU;cost, one product per line. */
export function CostImportForm() {
  const [state, action, pending] = useActionState(importProductCostsAction, initial);
  return (
    <form action={action} className={`${styles.panel} ${styles.form}`} data-testid="cost-import">
      <header className={styles.wide}>
        <div>
          <p>Carico di apertura</p>
          <h2>Costi dei prodotti già in magazzino</h2>
          <span>Una riga per prodotto: SKU e costo netto IVA separati da punto e virgola (o incollati da Excel). La giacenza non cambia; le vendite passate senza costo lo ricevono.</span>
        </div>
      </header>
      <label className={styles.wide}>
        SKU;costo
        <textarea name="rows" placeholder={"COBALT-DRAKE-4-60F;6,50\nPORTA-DECK-GIALLO;14,00"} required rows={6} />
      </label>
      <label className={styles.wide}>
        Motivo
        <input defaultValue="Costo di apertura" maxLength={500} minLength={3} name="reason" required />
      </label>
      <div className={styles.actions}>
        <button className={styles.primary} disabled={pending} type="submit">{pending ? "Salvataggio…" : "Salva costi"}</button>
        {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
      </div>
    </form>
  );
}
