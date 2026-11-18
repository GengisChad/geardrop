"use client";

import { useActionState } from "react";
import { setListPriceAction, type ListPriceState } from "@/app/admin/actions/products";
import { formatEuroInput } from "@/lib/admin/warehouse";
import styles from "./warehouse.module.css";

const initial: ListPriceState = { ok: false, message: "" };

/**
 * The selling price of one product, typed straight into the price list (2026-11-18): the same
 * checks as the product page, and the row, margin and totals are read again after saving.
 */
export function ListPriceCell({ productId, sku, priceCents }: { readonly productId: number; readonly sku: string; readonly priceCents: number }) {
  const [state, action, pending] = useActionState(setListPriceAction, initial);
  return (
    <form action={action} className={styles.costCell} data-testid={`list-price-form-${sku}`}>
      <input name="productId" type="hidden" value={productId} />
      <label>
        <span className={styles.srOnly}>Prezzo di vendita di {sku} in euro, IVA inclusa</span>
        <input
          autoComplete="off"
          defaultValue={formatEuroInput(priceCents)}
          inputMode="decimal"
          // The saved value comes back from the database: the field follows it, not what was typed.
          key={priceCents}
          name="price"
          placeholder="prezzo"
          required
        />
      </label>
      {state.needsConfirm ? (
        <label>
          <input name="belowCostConfirmed" type="checkbox" /> Vendi sotto costo
        </label>
      ) : null}
      <button disabled={pending} type="submit">{pending ? "…" : "Salva"}</button>
      {state.message ? <small className={state.ok ? styles.costSaved : styles.costRefused} role="status">{state.message}</small> : null}
    </form>
  );
}
