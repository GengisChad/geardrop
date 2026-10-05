import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/components/admin/content/content.module.css";
import { MetaRankingEditor, MetaSnapshotForm } from "@/components/admin/meta/meta-editors";
import { requireAdminAccess } from "@/lib/admin/access";
import { catalogueSlugOptions } from "@/lib/admin/meta";
import { getSnapshotRowByMonth, listRankingRows } from "@/lib/meta/repository";
import { META_TIERS, monthLabel } from "@/lib/meta/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminMetaMonthPage({ params }: { readonly params: Promise<{ readonly month: string }> }) {
  const { month } = await params;
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);

  const snapshot = await getSnapshotRowByMonth(client, month, { includeDrafts: true });
  if (!snapshot) notFound();
  const rows = await listRankingRows(client, snapshot.id);
  const catalogue = catalogueSlugOptions();

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>CONTENUTI / Meta attuale</p>
          <h1>{monthLabel(snapshot.month)}</h1>
          <span>
            {rows.length} voci · <Link href="/admin/meta">torna all&rsquo;elenco dei mesi</Link>
          </span>
        </div>
      </header>

      <div className={styles.stack}>
        <MetaSnapshotForm snapshot={snapshot} />
        {META_TIERS.map((tier) => (
          <MetaRankingEditor
            catalogue={catalogue}
            key={tier}
            rows={rows.filter((row) => row.tier_type === tier)}
            snapshotId={snapshot.id}
            tier={tier}
          />
        ))}
      </div>
    </div>
  );
}
