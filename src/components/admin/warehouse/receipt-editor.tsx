"use client";

import { useActionState, useMemo, useState } from "react";
import { saveReceiptDraftAction, type WarehouseActionState } from "@/app/admin/actions/warehouse";
import {
  allocateLandedCosts,
  DOCUMENT_KIND_LABELS,
  DOCUMENT_KINDS,
  formatEuro,
  formatEuroInput,
  parseEuroCents,
  VAT_REGIME_LABELS,
} from "@/lib/admin/warehouse";
import type { ReceiptDetail, ReceiptProductOption, Supplier } from "@/lib/admin/warehouse-repository";
import styles from "./warehouse.module.css";

const initial: WarehouseActionState = { ok: false, message: "" };

type LineState = { readonly key: number; readonly productId: string; readonly quantity: string; readonly unitCost: string };

type ReceiptEditorProps = {
  readonly suppliers: readonly Supplier[];
  readonly products: readonly ReceiptProductOption[];
  readonly receipt: ReceiptDetail | null;
  readonly today: string;
};

let nextKey = 1;
const emptyLine = (): LineState => ({ key: nextKey++, productId: "", quantity: "1", unitCost: "" });

/**
 * The supplier document as a draft: header, lines, freight and duties, and the landed cost of
 * every line computed the way the database will when the document is confirmed.
 */
export function ReceiptEditor({ suppliers, products, receipt, today }: ReceiptEditorProps) {
  const [state, action, pending] = useActionState(saveReceiptDraftAction, initial);
  const [lines, setLines] = useState<readonly LineState[]>(() =>
    receipt?.lines.length
      ? receipt.lines.map((line) => ({
          key: nextKey++,
          productId: String(line.product_id),
          quantity: String(line.quantity),
          unitCost: formatEuroInput(line.unit_cost_cents),
        }))
      : [emptyLine()],
  );
  const [freight, setFreight] = useState(formatEuroInput(receipt?.receipt.freight_cents ?? 0));
  const [duties, setDuties] = useState(formatEuroInput(receipt?.receipt.duties_cents ?? 0));
  const [supplierId, setSupplierId] = useState(String(receipt?.receipt.supplier_id ?? suppliers[0]?.id ?? ""));

  const productById = useMemo(() => new Map(products.map((product) => [String(product.id), product])), [products]);
  const supplier = suppliers.find((candidate) => String(candidate.id) === supplierId) ?? null;

  const parsedLines = lines.map((line) => ({
    productId: Number(line.productId),
    quantity: Number(line.quantity),
    unitCostCents: parseEuroCents(line.unitCost),
  }));
  const extraCents = (parseEuroCents(freight) ?? 0) + (parseEuroCents(duties) ?? 0);
  const computable = parsedLines.every((line) => Number.isInteger(line.quantity) && line.quantity > 0 && line.unitCostCents !== null);
  const landed = computable
    ? allocateLandedCosts(parsedLines.map((line) => ({ quantity: line.quantity, unitCostCents: line.unitCostCents ?? 0 })), extraCents)
    : null;
  const goodsCents = parsedLines.reduce((sum, line) => sum + (line.unitCostCents ?? 0) * (Number.isFinite(line.quantity) ? line.quantity : 0), 0);
  const payload = JSON.stringify(parsedLines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitCostCents: line.unitCostCents ?? Number.NaN,
  })));

  const update = (key: number, patch: Partial<LineState>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  return (
    <form action={action} className={`${styles.panel} ${styles.form}`} data-testid="receipt-editor">
      {receipt ? <input name="id" type="hidden" value={receipt.receipt.id} /> : null}
      <input name="lines" type="hidden" value={payload} />
      <header className={styles.wide}>
        <div>
          <p>Documento del fornitore</p>
          <h2>{receipt ? `${DOCUMENT_KIND_LABELS[receipt.receipt.document_kind]} ${receipt.receipt.document_number}` : "Nuovo carico merce"}</h2>
          <span>Costi al netto dell&apos;IVA. La bozza non tocca il magazzino finché non la carichi.</span>
        </div>
      </header>

      <label>
        Fornitore
        <select name="supplierId" onChange={(event) => setSupplierId(event.target.value)} required value={supplierId}>
          {suppliers.map((option) => (
            <option key={option.id} value={option.id}>{option.name} · {option.country_code}</option>
          ))}
        </select>
      </label>
      <label>
        Tipo documento
        <select defaultValue={receipt?.receipt.document_kind ?? "invoice"} name="documentKind">
          {DOCUMENT_KINDS.map((kind) => <option key={kind} value={kind}>{DOCUMENT_KIND_LABELS[kind]}</option>)}
        </select>
      </label>
      <label>
        Numero documento
        <input defaultValue={receipt?.receipt.document_number ?? ""} maxLength={60} name="documentNumber" required />
      </label>
      <label>
        Data documento
        <input defaultValue={receipt?.receipt.document_date ?? today} name="documentDate" required type="date" />
      </label>
      <label>
        Trasporto in entrata (€)
        <input inputMode="decimal" name="freight" onChange={(event) => setFreight(event.target.value)} value={freight} />
      </label>
      <label>
        Dazi e altri costi (€)
        <input inputMode="decimal" name="duties" onChange={(event) => setDuties(event.target.value)} value={duties} />
      </label>
      {supplier ? <p className={`${styles.hint} ${styles.wide}`}>Regime: {VAT_REGIME_LABELS[supplier.vat_regime]}.</p> : null}

      <div className={styles.lines}>
        <div className={styles.lineHead} aria-hidden="true">
          <span>Prodotto</span><span>Quantità</span><span>Costo unitario €</span><span>Quota spese</span><span>Costo a magazzino</span><span />
        </div>
        {lines.map((line, index) => {
          const product = productById.get(line.productId);
          const landedLine = landed?.[index];
          return (
            <div className={styles.lineRow} key={line.key} data-testid="receipt-line">
              <select aria-label={`Prodotto riga ${index + 1}`} onChange={(event) => update(line.key, { productId: event.target.value })} required value={line.productId}>
                <option value="">Scegli un prodotto…</option>
                {products.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} · {option.sku}{option.averageCostCents === null ? "" : ` · medio ${formatEuro(option.averageCostCents)}`}
                  </option>
                ))}
              </select>
              <input aria-label={`Quantità riga ${index + 1}`} inputMode="numeric" min={1} onChange={(event) => update(line.key, { quantity: event.target.value })} required type="number" value={line.quantity} />
              <input aria-label={`Costo unitario riga ${index + 1}`} inputMode="decimal" onChange={(event) => update(line.key, { unitCost: event.target.value })} placeholder="6,50" required value={line.unitCost} />
              <output>{landedLine ? formatEuro(landedLine.allocatedCents) : "—"}</output>
              <output title={product ? `Giacenza ${product.stockQuantity}` : undefined}>
                {landedLine ? `${formatEuro(landedLine.landedUnitCostCents)} / pz` : "—"}
              </output>
              <button
                aria-label={`Togli riga ${index + 1}`}
                className={styles.remove}
                disabled={lines.length === 1}
                onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))}
                type="button"
              >
                ×
              </button>
            </div>
          );
        })}
        <div>
          <button className={styles.secondary} onClick={() => setLines((current) => [...current, emptyLine()])} type="button">
            Aggiungi riga
          </button>
        </div>
      </div>

      <div className={styles.totals} aria-live="polite">
        <span>Merce <strong>{formatEuro(goodsCents)}</strong></span>
        <span>Spese <strong>{formatEuro(extraCents)}</strong></span>
        <span>Totale documento <strong>{formatEuro(goodsCents + extraCents)}</strong></span>
      </div>

      <label className={styles.wide}>
        Note
        <textarea defaultValue={receipt?.receipt.notes ?? ""} maxLength={2000} name="notes" rows={2} />
      </label>
      <div className={styles.actions}>
        <button className={styles.primary} disabled={pending || suppliers.length === 0} type="submit">
          {pending ? "Salvataggio…" : "Salva bozza"}
        </button>
        {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
      </div>
    </form>
  );
}
