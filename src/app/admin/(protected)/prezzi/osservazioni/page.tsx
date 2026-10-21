import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/components/admin/warehouse/warehouse.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { formatEuro } from "@/lib/admin/warehouse";
import { listObservations } from "@/lib/ai/pricing-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const dateTime = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" });
const AVAILABILITY: Record<string, string> = { in_stock: "Disponibile", out_of_stock: "Esaurito", preorder: "Pre-ordine", unknown: "—" };

export default async function ObservationsPage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const observations = await listObservations(client, principal.organization.id, { sinceDays: 90, limit: 200 });

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Prezzi / Agente IA</p>
          <h1>Prezzi osservati</h1>
          <span>Offerte trovate dall&apos;agente sulle fonti approvate negli ultimi 90 giorni · {observations.length}</span>
        </div>
        <Link href="/admin/prezzi">Torna alle proposte</Link>
      </header>
      {observations.length === 0 ? (
        <section className={`${styles.panel} ${styles.empty}`}><strong>Nessuna osservazione</strong><p>Approva delle fonti e avvia un&apos;analisi.</p></section>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Quando</th><th>Nostro prodotto</th><th>Offerta</th><th>Fonte</th><th className={styles.numeric}>Prezzo</th><th>Disponibilità</th><th>Condizione</th></tr></thead>
            <tbody>
              {observations.map((observation) => (
                <tr key={observation.id}>
                  <td>{dateTime.format(new Date(observation.observed_at))}</td>
                  <td>{observation.productName ?? "—"}</td>
                  <td><a href={observation.url} rel="noreferrer noopener" target="_blank">{observation.title}</a>{observation.notes ? <small>{observation.notes}</small> : null}</td>
                  <td>{observation.source_domain}</td>
                  <td className={styles.numeric}>{formatEuro(observation.price_cents)}</td>
                  <td>{AVAILABILITY[observation.availability ?? "unknown"] ?? observation.availability}</td>
                  <td>{observation.item_condition === "new" ? "Nuovo" : observation.item_condition === "used" ? "Usato" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
