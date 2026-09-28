"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setProductCostAction, type WarehouseActionState } from "@/app/admin/actions/warehouse";
import { DOCUMENT_KIND_LABELS, formatEuro, formatEuroInput, marginPercent, netOfVat, type DocumentKind } from "@/lib/admin/warehouse";
import type { ProductCost } from "@/lib/admin/warehouse-repository";
import styles from "./warehouse.module.css";

const initial: WarehouseActionState = { ok: false, message: "" };
const date = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" });

type ProductCostPanelProps = {
  readonly productId: number;
  readonly priceCents: number;
  readonly cost: ProductCost;
  readonly canSetCost: boolean;
};

/** What a product costs the company, what it earns on it, and where the cost came from. */
export function ProductCostPanel({ productId, priceCents, cost, canSetCost }: ProductCostPanelProps) {
  const [state, action, pending] = useActionState(setProductCostAction, initial);
  const netPrice = netOfVat(priceCents, cost.vatRateBp);
  const margin = marginPercent(netPrice, cost.averageCostCents);

  return (
    <section className={styles.panel} data-testid="product-cost-panel" id="costi">
      <header>
        <div>
          <p>Magazzino a costo</p>
          <h2>Costo e margine</h2>
          <span>Costi netti IVA. Il costo medio cambia solo con un carico merce o un costo impostato da un owner.</span>
        </div>
      </header>
      <dl className={styles.breakdown}>
        <div><dt>Prezzo di vendita</dt><dd>{formatEuro(priceCents)} IVA inclusa · {formatEuro(netPrice)} netto ({cost.vatRateBp / 100}%)</dd></div>
        <div>
          <dt>Costo medio</dt>
          <dd data-testid="average-cost">{cost.averageCostCents === null ? <span className={styles.missing}>costo mancante</span> : formatEuro(cost.averageCostCents)}</dd>
        </div>
        <div><dt>Ultimo costo</dt><dd>{formatEuro(cost.lastCostCents)}</dd></div>
        <div className={styles.result}>
          <dt>Margine sul netto</dt>
          <dd data-testid="product-margin">
            {margin === null ? "—" : `${margin.toLocaleString("it-IT")}% · ${formatEuro(netPrice - (cost.averageCostCents ?? 0))} a pezzo`}
          </dd>
        </div>
      </dl>
      {margin !== null && margin < 0 ? <p className={styles.error}>Il prezzo netto è sotto il costo medio: ogni vendita è in perdita.</p> : null}

      {cost.recentReceipts.length > 0 ? (
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Documento</th><th>Fornitore</th><th>Data</th><th className={styles.numeric}>Pezzi</th><th className={styles.numeric}>Costo a magazzino</th></tr></thead>
            <tbody>
              {cost.recentReceipts.map((receipt) => (
                <tr key={`${receipt.receiptId}-${receipt.documentNumber}`}>
                  <td><Link href={`/admin/carichi/${receipt.receiptId}`}>{DOCUMENT_KIND_LABELS[receipt.documentKind as DocumentKind] ?? receipt.documentKind} {receipt.documentNumber}</Link></td>
                  <td>{receipt.supplierName}</td>
                  <td>{date.format(new Date(`${receipt.documentDate}T12:00:00Z`))}</td>
                  <td className={styles.numeric}>{receipt.quantity}</td>
                  <td className={styles.numeric}>{formatEuro(receipt.landedUnitCostCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.hint}>Nessun carico merce per questo prodotto. <Link href="/admin/carichi/nuovo">Registra una fattura del fornitore</Link>.</p>
      )}

      {canSetCost ? (
        <form action={action} className={styles.form} data-testid="product-cost-form">
          <input name="productId" type="hidden" value={productId} />
          <label>
            Costo unitario netto (€)
            <input defaultValue={formatEuroInput(cost.averageCostCents)} inputMode="decimal" name="unitCost" placeholder="6,50" required />
          </label>
          <label className={styles.wide}>
            Motivo
            <input maxLength={500} minLength={3} name="reason" placeholder="Es. costo di apertura dalla fattura di settembre" required />
          </label>
          <label className={`${styles.check} ${styles.wide}`}>
            <input defaultChecked name="valueUnvaluedMovements" type="checkbox" />
            Usa questo costo anche per le vendite passate che non ne avevano uno
          </label>
          <div className={styles.actions}>
            <button className={styles.secondary} disabled={pending} type="submit">{pending ? "Salvataggio…" : "Imposta costo"}</button>
            {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}
