import Link from "next/link";
import { redirect } from "next/navigation";
import { disableCouponAction, duplicateCouponAction } from "@/app/admin/actions/coupons";
import styles from "@/components/admin/promotions/pricing.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCoupons } from "@/lib/admin/coupon-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic"; export const fetchCache="force-no-store";
export default async function CouponsPage(){const client=await createSupabaseServerClient();const principal=await requireAdminAccess(client);if(principal.role==="editor")redirect("/admin");const rows=await listCoupons(client);return <div className={styles.page}><header className={styles.heading}><div><p>Pricing / Codici</p><h1>Coupon</h1><span>{rows.length} codici reali · utilizzi dal ledger ordini</span></div><Link href="/admin/coupon/nuovo">Nuovo coupon</Link></header>{rows.length?<div className={styles.cards}>{rows.map(row=><article className={styles.card} key={row.id}><div><strong>{row.code}</strong><span>{row.discount_kind} · {row.discount_value} · {row.redemptionCount} utilizzi</span><small>{row.disabled_at?"Disabilitato":row.active?"Attivo":"Non attivo"}</small></div><div className={styles.cardActions}><Link href={`/admin/coupon/${row.id}`}>Modifica</Link><form action={duplicateCouponAction}><input name="id" type="hidden" value={row.id}/><button type="submit">Duplica</button></form>{!row.disabled_at?<form action={disableCouponAction}><input name="id" type="hidden" value={row.id}/><button className={styles.danger} type="submit">Disabilita ora</button></form>:null}</div></article>)}</div>:<p className={styles.empty}>Nessun coupon nel database.</p>}</div>}
