import Link from "next/link";
import { redirect } from "next/navigation";
import { togglePromotionAction } from "@/app/admin/actions/promotions";
import styles from "@/components/admin/promotions/pricing.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listPromotions } from "@/lib/admin/promotion-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

export const dynamic="force-dynamic"; export const fetchCache="force-no-store";
export default async function PromotionsPage(){const client=await createSupabaseServerClient();const principal=await requireAdminAccess(client);if(principal.role==="editor")redirect("/admin");const rows=await listPromotions(client);return <div className={styles.page}><header className={styles.heading}><div><p>Pricing / Automatico</p><h1>Promozioni</h1><span>{rows.length} regole reali · priorità PostgreSQL</span></div><Link href="/admin/promozioni/nuova">Nuova promozione</Link></header>{rows.length?<div className={styles.cards}>{rows.map(row=><article className={styles.card} key={row.id}><div><strong>{row.name}</strong><span>{row.discount_kind} · {row.discount_kind==="percentage"?`${row.discount_value}%`:formatPrice({amount:row.discount_value,currency:"EUR"})} · priorità {row.priority}</span><small>{row.active?"Attiva":"Non attiva"}</small></div><div className={styles.cardActions}><Link href={`/admin/promozioni/${row.id}`}>Modifica</Link><form action={togglePromotionAction}><input name="id" type="hidden" value={row.id}/><button type="submit">{row.active?"Disattiva":"Attiva"}</button></form></div></article>)}</div>:<p className={styles.empty}>Nessuna promozione nel database.</p>}</div>}
