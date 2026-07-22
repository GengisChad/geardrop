import { redirect } from "next/navigation";
import { CouponForm } from "@/components/admin/coupons/coupon-form";
import styles from "@/components/admin/promotions/pricing.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { loadPricingResources } from "@/lib/admin/promotion-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic"; export const fetchCache="force-no-store";
export default async function NewCouponPage(){const client=await createSupabaseServerClient();const principal=await requireAdminAccess(client);if(principal.role==="editor")redirect("/admin");const resources=await loadPricingResources(client);return <div className={styles.page}><header className={styles.heading}><div><p>Pricing / Nuovo</p><h1>Coupon</h1><span>Validazione e applicazione esclusivamente server-side</span></div></header><CouponForm data={null} resources={resources}/></div>}
