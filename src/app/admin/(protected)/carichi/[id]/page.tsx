import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ConfirmReceiptForm, DeleteReceiptDraftForm, ReverseReceiptForm } from "@/components/admin/warehouse/receipt-actions";
import { ReceiptEditor } from "@/components/admin/warehouse/receipt-editor";
import styles from "@/components/admin/warehouse/warehouse.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { DOCUMENT_KIND_LABELS, formatEuro, RECEIPT_STATUS_LABELS, VAT_REGIME_LABELS } from "@/lib/admin/warehouse";
import { listReceiptProductOptions, listSuppliers, loadReceipt } from "@/lib/admin/warehouse-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const dateTime = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" });
const date = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" });

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsedId = z.coerce.number().int().positive().safeParse((await params).id);
  if (!parsedId.success) notFound();
  const query = await searchParams;

  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const organizationId = principal.organization.id;
  const detail = await loadReceipt(client, organizationId, parsedId.data);
  if (!detail) notFound();
  const { receipt, supplier, lines } = detail;

  if (receipt.status === "draft") {
    const [suppliers, products] = await Promise.all([
      listSuppliers(client, organizationId),
      listReceiptProductOptions(client, organizationId),
    ]);
    const choosable = suppliers.filter((candidate) => candidate.active || candidate.id === receipt.supplier_id);
    return (
      <div className={styles.page}>
        <header className={styles.heading}>
          <div>
            <p>Magazzino / Carichi merce</p>
            <h1>Bozza</h1>
            <span>{supplier.name} · {DOCUMENT_KIND_LABELS[receipt.document_kind]} {receipt.document_number}</span>
          </div>
          <Link href="/admin/carichi">Torna ai carichi</Link>
        </header>
        {query.creato ? <p className={styles.success} role="status">Bozza creata. Controlla le righe e carica in magazzino.</p> : null}
        <ReceiptEditor products={products} receipt={detail} suppliers={choosable} today={receipt.document_date} />
        <ConfirmReceiptForm receiptId={receipt.id} />
        <DeleteReceiptDraftForm receiptId={receipt.id} />
      </div>
    );
  }

  const goodsCents = lines.reduce((sum, line) => sum + line.quantity * line.unit_cost_cents, 0);
  const extraCents = receipt.freight_cents + receipt.duties_cents;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Magazzino / Carichi merce</p>
          <h1>{DOCUMENT_KIND_LABELS[receipt.document_kind]} {receipt.document_number}</h1>
          <span>
            {supplier.name} · {date.format(new Date(`${receipt.document_date}T12:00:00Z`))} ·{" "}
            <span className={styles.status} data-status={receipt.status}>{RECEIPT_STATUS_LABELS[receipt.status]}</span>
          </span>
        </div>
        <Link href="/admin/carichi">Torna ai carichi</Link>
      </header>
      {query.caricato ? <p className={styles.success} role="status">Merce caricata: giacenza e costo medio aggiornati.</p> : null}

      <section className={styles.panel}>
        <dl className={styles.breakdown}>
          <div><dt>Regime IVA</dt><dd>{VAT_REGIME_LABELS[receipt.vat_regime]}</dd></div>
          <div><dt>Merce</dt><dd>{formatEuro(goodsCents)}</dd></div>
          <div><dt>Trasporto</dt><dd>{formatEuro(receipt.freight_cents)}</dd></div>
          <div><dt>Dazi e altri costi</dt><dd>{formatEuro(receipt.duties_cents)}</dd></div>
          <div className={styles.result}><dt>Valore a magazzino</dt><dd data-testid="receipt-value">{formatEuro(goodsCents + extraCents)}</dd></div>
          {receipt.confirmed_at ? <div><dt>Caricato il</dt><dd>{dateTime.format(new Date(receipt.confirmed_at))}</dd></div> : null}
          {receipt.reversed_at ? <div><dt>Stornato il</dt><dd>{dateTime.format(new Date(receipt.reversed_at))} — {receipt.reversal_reason}</dd></div> : null}
        </dl>
      </section>

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Prodotto</th><th className={styles.numeric}>Quantità</th><th className={styles.numeric}>Costo unitario</th>
              <th className={styles.numeric}>Quota spese</th><th className={styles.numeric}>Costo a magazzino</th><th className={styles.numeric}>Totale riga</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td><Link href={`/admin/prodotti/${line.product_id}`}>{line.productName}</Link><small className={styles.mono}>{line.productSku}</small></td>
                <td className={styles.numeric}>{line.quantity}</td>
                <td className={styles.numeric}>{formatEuro(line.unit_cost_cents)}</td>
                <td className={styles.numeric}>{formatEuro(line.allocated_costs_cents)}</td>
                <td className={styles.numeric}>{formatEuro(line.landed_unit_cost_cents)}</td>
                <td className={styles.numeric}>{formatEuro(line.landed_total_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {receipt.notes ? <p className={styles.hint}>Note: {receipt.notes}</p> : null}
      {receipt.status === "confirmed" ? <ReverseReceiptForm receiptId={receipt.id} /> : null}
    </div>
  );
}
