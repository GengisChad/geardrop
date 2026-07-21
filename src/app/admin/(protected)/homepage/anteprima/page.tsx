import Link from "next/link";
import { ManagedHomepage, type ManagedHomepageFallback } from "@/components/content/managed-homepage";
import styles from "@/components/admin/homepage/homepage.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listHomepageSections } from "@/lib/content/repository";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { resolveHomepageSections } from "@/lib/storefront/homepage-resolver";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminHomepagePreviewPage() {
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);

  // The same renderer the public homepage uses, only fed the draft-inclusive section list
  // an authenticated admin is allowed to see. One renderer, two audiences — never a
  // preview that looks different from what ships.
  const commerce = await getCommerceProvider();
  const [sections, featured, latest, bestSellers, bundle, hero, all] = await Promise.all([
    listHomepageSections(client, { includeDrafts: true }),
    commerce.listProducts({ sort: "popolari", perPage: 6 }),
    commerce.listProducts({ sort: "novita", perPage: 6 }),
    commerce.listProducts({ sort: "popolari", category: "beyblade-x", perPage: 5 }),
    commerce.getBundle(),
    commerce.getProduct("stadio-beystadium-x-attack-set"),
    commerce.listProducts({ perPage: 100 }),
  ]);

  const resolved = hero ? await resolveHomepageSections(sections, commerce) : [];
  const fallback: ManagedHomepageFallback | null = hero
    ? {
        heroProduct: hero,
        bundle,
        featured: featured.items,
        latest: latest.items,
        bestSellers: bestSellers.items,
        all: all.items,
      }
    : null;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeading}>
        <div>
          <p>CMS / Preview autenticata</p>
          <h1>Anteprima homepage</h1>
          <span>Include bozze e sezioni non attive. Non è la vetrina pubblica.</span>
        </div>
        <Link href="/admin/homepage">Torna all’editor</Link>
      </header>
      {sections.length === 0 || !fallback ? (
        <div className={styles.emptyState}>
          <strong>Nessuna sezione</strong>
          <p>Il database è vuoto o manca il prodotto di riferimento. Crea la prima sezione dall’editor.</p>
        </div>
      ) : (
        <main>
          <ManagedHomepage sections={resolved} fallback={fallback} />
        </main>
      )}
    </div>
  );
}
