import Link from "next/link";
import { MediaLibrary } from "@/components/admin/media/media-library";
import { MediaUploadClient } from "@/components/admin/media/media-upload-client";
import styles from "@/components/admin/media/media.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { readMediaUploadConfig } from "@/lib/admin/media-config.server";
import { listAdminMedia, normalizeAdminMediaQuery } from "@/lib/admin/media-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = normalizeAdminMediaQuery(params);
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  const [page, config] = await Promise.all([
    listAdminMedia(client, query),
    Promise.resolve(readMediaUploadConfig(process.env)),
  ]);
  const hrefFor = (nextPage: number) => ({ pathname: "/admin/media", query: { ...params, page: String(nextPage) } });

  return <div className={styles.page}>
    <header className={styles.heading}><div><p>Catalogo / Asset</p><h1>Media</h1><span>{page.total} asset reali · preview firmate 5 minuti</span></div></header>
    <MediaUploadClient batchLimit={config.batchLimit} />
    <form className={styles.filters} method="get">
      <label>Cerca<input defaultValue={query.q} name="q" placeholder="File, alt o path" /></label>
      <label>Stato<select defaultValue={query.status} name="status"><option value="ready">Ready</option><option value="pending">Pending</option><option value="failed">Failed</option></select></label>
      <button type="submit">Filtra</button><Link href="/admin/media">Azzera</Link>
    </form>
    {page.items.length === 0
      ? <section className={styles.empty}><h2>Nessun media caricato</h2><p>Seleziona o trascina immagini raster per iniziare.</p></section>
      : <MediaLibrary items={page.items} role={principal.role} />}
    <nav className={styles.pagination} aria-label="Paginazione media">
      {page.page > 1 ? <Link href={hrefFor(page.page - 1)}>Precedente</Link> : <span />}
      <span>Pagina {page.page} di {page.pageCount}</span>
      {page.page < page.pageCount ? <Link href={hrefFor(page.page + 1)}>Successiva</Link> : <span />}
    </nav>
  </div>;
}
