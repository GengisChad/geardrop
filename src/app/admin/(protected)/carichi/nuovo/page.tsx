import Link from "next/link";
import { redirect } from "next/navigation";
import { ReceiptEditor } from "@/components/admin/warehouse/receipt-editor";
import styles from "@/components/admin/warehouse/warehouse.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listReceiptProductOptions, listSuppliers } from "@/lib/admin/warehouse-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function NewReceiptPage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const organizationId = principal.organization.id;
  const [suppliers, products] = await Promise.all([
    listSuppliers(client, organizationId),
    listReceiptProductOptions(client, organizationId),
  ]);
  const activeSuppliers = suppliers.filter((supplier) => supplier.active);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Magazzino / Carichi merce</p>
          <h1>Nuovo carico</h1>
          <span>Riporta la fattura o il DDT del fornitore riga per riga, con i costi al netto dell&apos;IVA.</span>
        </div>
        <Link href="/admin/carichi">Torna ai carichi</Link>
      </header>
      {activeSuppliers.length === 0 ? (
        <section className={`${styles.panel} ${styles.empty}`}>
          <strong>Prima serve un fornitore</strong>
          <p>Il regime IVA del fornitore dice come leggere il documento.</p>
          <Link className={styles.primary} href="/admin/fornitori">Aggiungi un fornitore</Link>
        </section>
      ) : products.length === 0 ? (
        <section className={`${styles.panel} ${styles.empty}`}>
          <strong>Nessun prodotto a catalogo</strong>
          <p>Crea i prodotti di questa azienda prima di caricarne la merce.</p>
          <Link className={styles.primary} href="/admin/prodotti/nuovo">Nuovo prodotto</Link>
        </section>
      ) : (
        <ReceiptEditor products={products} receipt={null} suppliers={activeSuppliers} today={today} />
      )}
    </div>
  );
}
