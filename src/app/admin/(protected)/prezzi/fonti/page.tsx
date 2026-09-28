import Link from "next/link";
import { redirect } from "next/navigation";
import { MarketSourceForm, PricingPolicyForm } from "@/components/admin/pricing/pricing-forms";
import styles from "@/components/admin/warehouse/warehouse.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listMarketSources, loadPricingPolicy } from "@/lib/ai/pricing-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function PricingSourcesPage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const organizationId = principal.organization.id;
  const [sources, policy] = await Promise.all([listMarketSources(client, organizationId), loadPricingPolicy(client, organizationId)]);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Prezzi / Agente IA</p>
          <h1>Fonti e politica</h1>
          <span>L&apos;agente cerca e legge solo questi domini · Amazon escluso per decisione dei soci</span>
        </div>
        <Link href="/admin/prezzi">Torna alle proposte</Link>
      </header>
      <PricingPolicyForm editable={principal.role === "owner"} policy={policy} />
      <section className={styles.suppliers} aria-labelledby="fonti-title">
        <h2 id="fonti-title">Fonti approvate · {sources.filter((source) => source.active).length} attive</h2>
        {sources.map((source) => <MarketSourceForm key={source.id} source={source} />)}
        <MarketSourceForm source={null} />
      </section>
    </div>
  );
}
