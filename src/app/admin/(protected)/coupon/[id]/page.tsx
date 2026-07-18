import { notFound, redirect } from "next/navigation";
import { CouponForm } from "@/components/admin/coupons/coupon-form";
import styles from "@/components/admin/promotions/pricing.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { couponIdSchema } from "@/lib/admin/coupons";
import { loadCouponEditor } from "@/lib/admin/coupon-repository";
import { loadPricingResources } from "@/lib/admin/promotion-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic"; export const fetchCache="force-no-store";
export default async function EditCouponPage({params}:{readonly params:Promise<{id:string}>}){const parsed=couponIdSchema.safeParse((await params).id);if(!parsed.success)notFound();const client=await createSupabaseServerClient();const principal=await requireAdminAccess(client);if(principal.role==="editor")redirect("/admin");const [data,resources]=await Promise.all([loadCouponEditor(client,parsed.data),loadPricingResources(client)]);if(!data)notFound();return <div className={styles.page}><header className={styles.heading}><div><p>Pricing / Coupon</p><h1>{data.coupon.code}</h1><span>{data.redemptionCount} utilizzi reali</span></div></header><CouponForm data={data} resources={resources}/></div>}
