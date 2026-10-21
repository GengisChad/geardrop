"use client";

import { useActionState } from "react";
import { setCostDefaultsAction, type WarehouseActionState } from "@/app/admin/actions/warehouse";
import { formatEuroInput } from "@/lib/admin/warehouse";
import styles from "./warehouse.module.css";

const initial: WarehouseActionState = { ok: false, message: "" };

/** The company's profit defaults: VAT rate of its sales and packaging per shipped order. */
export function CostDefaultsForm({ vatRateBp, packagingCostCents }: { readonly vatRateBp: number; readonly packagingCostCents: number }) {
  const [state, action, pending] = useActionState(setCostDefaultsAction, initial);
  return (
    <form action={action} className={`${styles.panel} ${styles.form}`} data-testid="cost-defaults">
      <header className={styles.wide}>
        <div>
          <p>Profitto</p>
          <h2>Costi predefiniti</h2>
          <span>Aliquota IVA delle vendite (scorporata dal ricavo) e imballo per ordine. Gli ordini già registrati tengono la loro aliquota.</span>
        </div>
      </header>
      <label>
        Aliquota IVA vendite (%)
        <input defaultValue={(vatRateBp / 100).toString().replace(".", ",")} inputMode="decimal" name="vatRate" required />
      </label>
      <label>
        Imballo per ordine (€)
        <input defaultValue={formatEuroInput(packagingCostCents)} inputMode="decimal" name="packagingCost" />
      </label>
      <div className={styles.actions}>
        <button className={styles.primary} disabled={pending} type="submit">{pending ? "Salvataggio…" : "Salva costi"}</button>
        {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
      </div>
    </form>
  );
}
