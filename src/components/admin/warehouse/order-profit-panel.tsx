"use client";

import { useActionState } from "react";
import { setOrderCostsAction, type WarehouseActionState } from "@/app/admin/actions/warehouse";
import { formatEuro, formatEuroInput, MISSING_COST_LABELS } from "@/lib/admin/warehouse";
import type { OrderProfit } from "@/lib/admin/warehouse-repository";
import styles from "./warehouse.module.css";

const initial: WarehouseActionState = { ok: false, message: "" };

type OrderProfitPanelProps = {
  readonly orderId: number;
  readonly profit: OrderProfit | null;
  /** What staff typed on the order itself; null means the default applies. */
  readonly overrides: {
    readonly shippingCostCents: number | null;
    readonly packagingCostCents: number | null;
    readonly paymentFeeCents: number | null;
    readonly paymentFeeSource: string | null;
  };
};

/** The management profit of a paid order: revenue net of VAT minus every cost, or what is missing. */
export function OrderProfitPanel({ orderId, profit, overrides }: OrderProfitPanelProps) {
  const [state, action, pending] = useActionState(setOrderCostsAction, initial);
  const missing = profit?.missing ?? [];
  const margin = profit?.profit_cents != null && profit.revenue_net_cents
    ? Math.round((profit.profit_cents / profit.revenue_net_cents) * 1000) / 10
    : null;

  return (
    <section className={styles.panel} data-testid="order-profit">
      <header>
        <div>
          <p>Conto economico</p>
          <h2>Profitto dell&apos;ordine</h2>
          <span>Margine gestionale su importi netti IVA: non è un dato fiscale.</span>
        </div>
        {profit ? (
          <span className={styles.status} data-status={missing.length ? "incomplete" : "complete"}>
            {missing.length ? "Incompleto" : "Completo"}
          </span>
        ) : null}
      </header>
      {profit ? (
        <dl className={styles.breakdown}>
          <div><dt>Incassato (al netto dei rimborsi)</dt><dd>{formatEuro(profit.revenue_gross_cents)}</dd></div>
          <div><dt>Ricavo netto IVA ({(profit.vat_rate_bp ?? 0) / 100}%)</dt><dd>{formatEuro(profit.revenue_net_cents)}</dd></div>
          <div><dt>Costo merce</dt><dd>{profit.cost_of_goods_cents == null ? <span className={styles.missing}>mancante</span> : `−${formatEuro(profit.cost_of_goods_cents)}`}</dd></div>
          <div>
            <dt>Corriere{overrides.shippingCostCents === null ? " (predefinito del metodo)" : ""}</dt>
            <dd>{profit.shipping_cost_cents == null ? <span className={styles.missing}>mancante</span> : `−${formatEuro(profit.shipping_cost_cents)}`}</dd>
          </div>
          <div>
            <dt>Commissione pagamento{overrides.paymentFeeSource === "stripe" ? " (Stripe)" : overrides.paymentFeeSource === "manual" ? " (inserita)" : ""}</dt>
            <dd>{profit.payment_fee_cents == null ? <span className={styles.missing}>mancante</span> : `−${formatEuro(profit.payment_fee_cents)}`}</dd>
          </div>
          <div><dt>Imballo{overrides.packagingCostCents === null ? " (predefinito)" : ""}</dt><dd>−{formatEuro(profit.packaging_cost_cents)}</dd></div>
          <div className={styles.result}>
            <dt>Profitto</dt>
            <dd data-testid="order-profit-value">
              {profit.profit_cents == null
                ? <span className={styles.missing}>manca: {missing.map((key) => MISSING_COST_LABELS[key] ?? key).join(", ")}</span>
                : `${formatEuro(profit.profit_cents)}${margin === null ? "" : ` · ${margin.toLocaleString("it-IT")}%`}`}
            </dd>
          </div>
        </dl>
      ) : (
        <p className={styles.hint}>Il profitto si calcola sugli ordini pagati.</p>
      )}

      <form action={action} className={styles.form}>
        <input name="orderId" type="hidden" value={orderId} />
        <label>
          Costo corriere (€)
          <input defaultValue={formatEuroInput(overrides.shippingCostCents)} inputMode="decimal" name="shippingCost" placeholder="predefinito" />
        </label>
        <label>
          Imballo (€)
          <input defaultValue={formatEuroInput(overrides.packagingCostCents)} inputMode="decimal" name="packagingCost" placeholder="predefinito" />
        </label>
        <label>
          Commissione pagamento (€)
          <input defaultValue={formatEuroInput(overrides.paymentFeeCents)} inputMode="decimal" name="paymentFee" placeholder="da Stripe" />
        </label>
        <p className={`${styles.hint} ${styles.wide}`}>Vuoto: si usa il costo del metodo di spedizione, l&apos;imballo predefinito dell&apos;azienda e la commissione letta da Stripe. Ritiro a mano: corriere 0.</p>
        <div className={styles.actions}>
          <button className={styles.secondary} disabled={pending} type="submit">{pending ? "Salvataggio…" : "Salva costi"}</button>
          {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
        </div>
      </form>
    </section>
  );
}
