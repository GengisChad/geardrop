"use client";

import { useActionState } from "react";
import { setProductCostAction, type WarehouseActionState } from "@/app/admin/actions/warehouse";
import { formatEuroInput } from "@/lib/admin/warehouse";
import styles from "./warehouse.module.css";

const initial: WarehouseActionState = { ok: false, message: "" };

/**
 * The cost of one product, typed straight into the price list (owner, 2026-11-17: "una casella
 * dove si può inserire o modificare manualmente il prezzo"). Saving it is the same audited
 * action as the product page's: the row, the shelf and the totals above are read again from the
 * database, and the past sales of that product that had no cost receive this one.
 */
export function ListCostCell({ productId, sku, costCents }: { readonly productId: number; readonly sku: string; readonly costCents: number | null }) {
  const [state, action, pending] = useActionState(setProductCostAction, initial);
  return (
    <form action={action} className={styles.costCell} data-testid={`list-cost-form-${sku}`}>
      <input name="productId" type="hidden" value={productId} />
      <input name="reason" type="hidden" value="Costo inserito dal listino" />
      <input name="valueUnvaluedMovements" type="hidden" value="on" />
      <label>
        <span className={styles.srOnly}>Costo di {sku} in euro, netto IVA</span>
        <input
          autoComplete="off"
          data-missing={costCents === null ? "true" : undefined}
          defaultValue={formatEuroInput(costCents)}
          inputMode="decimal"
          // The saved value comes back from the database: the field follows it, not what was typed.
          key={costCents ?? "none"}
          name="unitCost"
          placeholder="costo"
          required
        />
      </label>
      <button disabled={pending} type="submit">{pending ? "…" : "Salva"}</button>
      {state.message ? <small className={state.ok ? styles.costSaved : styles.costRefused} role="status">{state.message}</small> : null}
    </form>
  );
}
