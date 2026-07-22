import Link from "next/link";
import styles from "@/components/admin/content/content.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listContentPages } from "@/lib/content/repository";
import { MANAGED_PAGE_LABELS, MANAGED_PAGE_SLUGS } from "@/lib/content/managed-pages";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminPagesPage() {
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);
  const pages = await listContentPages(client, { includeDrafts: true });
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  return <div className={styles.page}><header className={styles.heading}><div><p>CMS / Informazioni</p><h1>Pagine</h1><span>{pages.length} righe reali nel database · nessun contenuto inventato</span></div></header><div className={styles.pageList}>{MANAGED_PAGE_SLUGS.map((slug) => { const page = bySlug.get(slug); return <Link className={styles.pageCard} href={`/admin/pagine/${slug}`} key={slug}><div><b>{page?.publication_status ?? "assente"}</b><strong>{page?.title ?? MANAGED_PAGE_LABELS[slug]}</strong><span>/{slug}</span></div><small>{page ? (page.active ? "Visibile" : "Non visibile") : "Crea contenuto"}</small></Link>; })}</div></div>;
}
