import Link from "next/link";
import { redirect } from "next/navigation";
import { CostImportForm } from "@/components/admin/warehouse/cost-import-form";
import styles from "@/components/admin/warehouse/warehouse.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { DOCUMENT_KIND_LABELS, formatEuro, RECEIPT_STATUS_LABELS } from "@/lib/admin/warehouse";
import { listReceipts, loadWarehouseSummary } from "@/lib/admin/warehouse-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const STATUSES = ["draft", "confirmed", "reversed"] as const;
const date = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" });

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedStatus = first(params.stato);
  const status = STATUSES.find((candidate) => candidate === requestedStatus) ?? null;
  const pageNumber = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const organizationId = principal.organization.id;
  const [receipts, summary] = await Promise.all([
    listReceipts(client, organizationId, { status, page: pageNumber }),
    loadWarehouseSummary(client, organizationId),
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Magazzino / Acquisti</p>
          <h1>Carichi merce</h1>
          <span>Fatture e DDT dei fornitori · costi netti IVA · {receipts.total} documenti</span>
        </div>
        <Link href="/admin/carichi/nuovo">Nuovo carico</Link>
      </header>

      <section className={styles.metrics} aria-label="Valore di magazzino">
        <article className={styles.metric} data-tone="good">
          <span>Valore magazzino</span>
          <strong data-testid="stock-value">{formatEuro(summary.stockValueCents)}</strong>
          <small>Giacenza × costo medio</small>
        </article>
        <article className={styles.metric} data-tone={summary.productsWithoutCost > 0 ? "warning" : undefined}>
          <span>Prodotti senza costo</span>
          <strong>{summary.productsWithoutCost}</strong>
          <small><Link href={{ pathname: "/admin/inventario", query: { costo: "mancante" } }}>Vedi in inventario</Link></small>
        </article>
        <article className={styles.metric} data-tone={summary.draftReceipts > 0 ? "warning" : undefined}>
          <span>Bozze da caricare</span>
          <strong>{summary.draftReceipts}</strong>
          <small>Non ancora in giacenza</small>
        </article>
        <article className={styles.metric}>
          <span>Fornitori</span>
          <strong><Link href="/admin/fornitori">Gestisci</Link></strong>
          <small>Regime IVA per fornitore</small>
        </article>
      </section>

      <nav className={styles.filters} aria-label="Filtra per stato">
        <Link aria-current={status === null ? "page" : undefined} href="/admin/carichi">Tutti</Link>
        {STATUSES.map((candidate) => (
          <Link aria-current={status === candidate ? "page" : undefined} href={{ pathname: "/admin/carichi", query: { stato: candidate } }} key={candidate}>
            {RECEIPT_STATUS_LABELS[candidate]}
          </Link>
        ))}
      </nav>

      {receipts.items.length === 0 ? (
        <section className={`${styles.panel} ${styles.empty}`}>
          <strong>Nessun documento</strong>
          <p>Registra la prima fattura o DDT del fornitore: la merce entra in magazzino con il suo costo.</p>
          <Link className={styles.primary} href="/admin/carichi/nuovo">Nuovo carico</Link>
        </section>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Data</th><th>Documento</th><th>Fornitore</th><th className={styles.numeric}>Righe</th>
                <th className={styles.numeric}>Pezzi</th><th className={styles.numeric}>Valore netto</th><th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {receipts.items.map((receipt) => (
                <tr key={receipt.id}>
                  <td>{date.format(new Date(`${receipt.document_date}T12:00:00Z`))}</td>
                  <td><Link href={`/admin/carichi/${receipt.id}`}>{DOCUMENT_KIND_LABELS[receipt.document_kind]} {receipt.document_number}</Link></td>
                  <td>{receipt.supplierName}</td>
                  <td className={styles.numeric}>{receipt.lineCount}</td>
                  <td className={styles.numeric}>{receipt.quantity}</td>
                  <td className={styles.numeric}>{formatEuro(receipt.valueCents)}</td>
                  <td><span className={styles.status} data-status={receipt.status}>{RECEIPT_STATUS_LABELS[receipt.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {principal.role === "owner" ? <CostImportForm /> : null}

      {receipts.pageCount > 1 ? (
        <nav className={styles.pagination} aria-label="Pagine">
          {pageNumber > 1 ? <Link href={{ pathname: "/admin/carichi", query: { ...(status ? { stato: status } : {}), page: String(pageNumber - 1) } }}>← Precedente</Link> : <span />}
          <span>Pagina {pageNumber} di {receipts.pageCount}</span>
          {pageNumber < receipts.pageCount ? <Link href={{ pathname: "/admin/carichi", query: { ...(status ? { stato: status } : {}), page: String(pageNumber + 1) } }}>Successiva →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
