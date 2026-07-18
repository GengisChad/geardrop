import { redirect } from "next/navigation";
import { PromotionForm } from "@/components/admin/promotions/promotion-form";
import styles from "@/components/admin/promotions/pricing.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { loadPricingResources } from "@/lib/admin/promotion-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic"; export const fetchCache="force-no-store";
export default async function NewPromotionPage(){const client=await createSupabaseServerClient();const principal=await requireAdminAccess(client);if(principal.role==="editor")redirect("/admin");const resources=await loadPricingResources(client);return <div className={styles.page}><header className={styles.heading}><div><p>Pricing / Nuova</p><h1>Promozione</h1><span>Dati reali, calcolo finale server-side</span></div></header><PromotionForm data={null} resources={resources}/></div>}
