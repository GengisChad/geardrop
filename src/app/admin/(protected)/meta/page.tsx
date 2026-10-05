import Link from "next/link";
import styles from "@/components/admin/content/content.module.css";
import { MetaSnapshotForm, MetaVideoEditor } from "@/components/admin/meta/meta-editors";
import { requireAdminAccess } from "@/lib/admin/access";
import { listArchive, listMetaVideos } from "@/lib/meta/repository";
import { monthLabel } from "@/lib/meta/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminMetaPage() {
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);
  const [months, videos] = await Promise.all([
    listArchive(client, { includeDrafts: true }),
    listMetaVideos(client, { includeDrafts: true }),
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>CONTENUTI / Meta attuale</p>
          <h1>Meta</h1>
          <span>{months.length} mesi · la pagina pubblica mostra sempre il più recente pubblicato</span>
        </div>
      </header>

      <div className={styles.pageList}>
        {months.map((month) => (
          <Link className={styles.pageCard} href={`/admin/meta/${month.month}`} key={month.month}>
            <div>
              <b>{month.publishedAt ? "pubblicato" : "bozza"}</b>
              <strong>{month.title}</strong>
              <span>/meta/{month.month}</span>
            </div>
            <small>{monthLabel(month.month)}</small>
          </Link>
        ))}
      </div>

      <div className={styles.stack}>
        <MetaSnapshotForm snapshot={null} />
        <MetaVideoEditor rows={videos} />
      </div>
    </div>
  );
}
