import Image from "next/image";
import Link from "next/link";
import styles from "@/components/admin/catalog/catalog.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listAdminBundles } from "@/lib/admin/bundle-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export default async function AdminBundlesPage() {
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);
  const page = await listAdminBundles(client);
  return <div className={styles.page}><header className={styles.heading}><div><p>Catalogo / Composizioni</p><h1>Bundle</h1><span>{page.total} righe reali · prezzi e finestre dal database</span></div><Link href="/admin/bundle/nuovo">Nuovo bundle</Link></header>{page.items.length === 0 ? <section className={styles.empty}><strong>Nessun bundle</strong><p>Database vuoto. Nessuna offerta inventata.</p><Link href="/admin/bundle/nuovo">Crea bundle</Link></section> : <div className={styles.orderRail}>{page.items.map((bundle, index) => <article className={styles.orderCard} key={bundle.id}><span className={styles.orderNumber}>{String(index + 1).padStart(2, "0")}</span><div className={styles.mediaThumb}>{bundle.previewUrl ? <Image alt="" fill sizes="64px" src={bundle.previewUrl} unoptimized /> : <span>NO IMG</span>}</div><div className={styles.cardIdentity}><strong>{bundle.title_line_one} {bundle.title_line_two}</strong><span>/{bundle.slug}</span><small>{bundle.itemCount} prodotti · hero {bundle.heroName}</small></div><span className={styles.status} data-status={bundle.active ? "published" : "draft"}>{bundle.active ? "attivo" : "bozza"}</span><strong>{money.format(bundle.price_cents / 100)}</strong><Link href={`/admin/bundle/${bundle.id}`}>Modifica</Link></article>)}</div>}</div>;
}

