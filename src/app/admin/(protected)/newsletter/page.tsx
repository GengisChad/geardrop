import { redirect } from "next/navigation";
import styles from "@/components/admin/team/team.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listNewsletterSubscribers } from "@/lib/admin/newsletter-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const dateFormatter = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" });

/**
 * The newsletter list (owner, 2026-11-13). Only confirmed addresses are listed and exported: a
 * pending signup has not consented yet, and an unsubscribed one must not be written to.
 */
export default async function NewsletterPage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const list = await listNewsletterSubscribers(client);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Clienti / Novità</p>
          <h1>Newsletter</h1>
          <span>
            {list.confirmed.length} iscritti confermati · {list.pending} in attesa di conferma · {list.unsubscribed} cancellati
          </span>
        </div>
        {list.confirmed.length > 0 ? <a href="/admin/newsletter/export">Esporta CSV</a> : null}
      </header>
      <section className={styles.panel}>
        <p>
          Scrivi solo agli iscritti confermati. In ogni email metti il link per cancellarsi della persona: è nella colonna
          «link_cancellazione» del CSV.
        </p>
      </section>
      {list.confirmed.length === 0 ? (
        <section className={styles.empty}>
          <strong>Nessun iscritto confermato</strong>
          <p>Le iscrizioni arrivano dal banner della home e contano solo dopo la conferma via email.</p>
        </section>
      ) : (
        <ul className={styles.members}>
          {list.confirmed.map((row) => (
            <li key={row.email} className={styles.member}>
              <strong>{row.email}</strong>
              <span>confermato il {dateFormatter.format(new Date(row.confirmed_at ?? row.created_at))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
