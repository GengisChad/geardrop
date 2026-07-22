import { notFound, redirect } from "next/navigation";
import { PromotionForm } from "@/components/admin/promotions/promotion-form";
import styles from "@/components/admin/promotions/pricing.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { promotionIdSchema } from "@/lib/admin/promotions";
import { loadPricingResources, loadPromotionEditor } from "@/lib/admin/promotion-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic"; export const fetchCache="force-no-store";
export default async function EditPromotionPage({params}:{readonly params:Promise<{id:string}>}){const parsed=promotionIdSchema.safeParse((await params).id);if(!parsed.success)notFound();const client=await createSupabaseServerClient();const principal=await requireAdminAccess(client);if(principal.role==="editor")redirect("/admin");const [data,resources]=await Promise.all([loadPromotionEditor(client,parsed.data),loadPricingResources(client)]);if(!data)notFound();return <div className={styles.page}><header className={styles.heading}><div><p>Pricing / Regola</p><h1>{data.promotion.name}</h1><span>{data.affectedProducts.length} prodotti diretti coinvolti</span></div></header><PromotionForm data={data} resources={resources}/></div>}
