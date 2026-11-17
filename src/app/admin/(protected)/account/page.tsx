import { ChangePasswordForm } from "@/components/admin/account-forms";
import styles from "@/components/admin/warehouse/warehouse.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const ROLE_LABELS = { owner: "Proprietario", admin: "Admin", editor: "Editor" } as const;

export default async function AccountPage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  const { data } = await client.auth.getUser();

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Il mio account</p>
          <h1>Account</h1>
          <span>{data.user?.email ?? "—"}</span>
        </div>
      </header>
      <section className={styles.panel} aria-labelledby="aziende-title">
        <header><div><h2 id="aziende-title">Aziende e ruoli</h2><span>Il ruolo vale per azienda. Si cambia azienda dal selettore in alto.</span></div></header>
        <dl className={styles.breakdown}>
          {principal.organizations.map((organization) => (
            <div key={organization.id}>
              <dt>{organization.name}{organization.id === principal.organization.id ? " (in uso)" : ""}</dt>
              <dd>{ROLE_LABELS[organization.role]}</dd>
            </div>
          ))}
        </dl>
      </section>
      <ChangePasswordForm />
    </div>
  );
}
