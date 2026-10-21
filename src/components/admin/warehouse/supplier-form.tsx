"use client";

import { useActionState } from "react";
import { saveSupplierAction, type WarehouseActionState } from "@/app/admin/actions/warehouse";
import { VAT_REGIME_LABELS, VAT_REGIMES } from "@/lib/admin/warehouse";
import type { Supplier } from "@/lib/admin/warehouse-repository";
import styles from "./warehouse.module.css";

const initial: WarehouseActionState = { ok: false, message: "" };

/** One supplier: the card of an existing one, or the form for a new one. */
export function SupplierForm({ supplier }: { readonly supplier: Supplier | null }) {
  const [state, action, pending] = useActionState(saveSupplierAction, initial);
  const key = supplier?.id ?? "new";

  return (
    <form action={action} className={`${styles.panel} ${styles.form}`} data-testid={`supplier-form-${key}`}>
      {supplier ? <input name="id" type="hidden" value={supplier.id} /> : null}
      <header className={styles.wide}>
        <div>
          <p>{supplier ? `Fornitore · ${supplier.country_code}` : "Nuovo fornitore"}</p>
          <h2>{supplier?.name ?? "Aggiungi un fornitore"}</h2>
        </div>
        {supplier && !supplier.active ? <span className={styles.status}>Non attivo</span> : null}
      </header>
      <label>
        Nome
        <input defaultValue={supplier?.name ?? ""} maxLength={160} name="name" required />
      </label>
      <label>
        Paese (ISO)
        <input defaultValue={supplier?.country_code ?? "ES"} maxLength={2} minLength={2} name="countryCode" required />
      </label>
      <label>
        Partita IVA
        <input defaultValue={supplier?.vat_number ?? ""} maxLength={32} name="vatNumber" />
      </label>
      <label className={styles.wide}>
        Regime IVA degli acquisti
        <select defaultValue={supplier?.vat_regime ?? "intra_ue"} name="vatRegime">
          {VAT_REGIMES.map((regime) => (
            <option key={regime} value={regime}>{VAT_REGIME_LABELS[regime]}</option>
          ))}
        </select>
      </label>
      <label>
        Email
        <input defaultValue={supplier?.email ?? ""} name="email" type="email" />
      </label>
      <label className={styles.wide}>
        Note
        <textarea defaultValue={supplier?.notes ?? ""} maxLength={2000} name="notes" rows={2} />
      </label>
      {supplier ? (
        <label className={styles.check}>
          <input defaultChecked={supplier.active} name="active" type="checkbox" />
          Attivo (compare nei nuovi carichi)
        </label>
      ) : null}
      <div className={styles.actions}>
        <button className={styles.primary} disabled={pending} type="submit">
          {pending ? "Salvataggio…" : supplier ? "Salva fornitore" : "Crea fornitore"}
        </button>
        {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
      </div>
    </form>
  );
}
