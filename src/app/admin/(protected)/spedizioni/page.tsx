import { redirect } from "next/navigation";
import { ShippingMethodForm } from "@/components/admin/settings/settings-forms";
import styles from "@/components/admin/settings/settings.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { loadShippingMethods } from "@/lib/admin/settings-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic"; export const fetchCache="force-no-store";
export default async function ShippingAdminPage(){const client=await createSupabaseServerClient();const principal=await requireAdminAccess(client);if(principal.role==="editor")redirect("/admin");const methods=await loadShippingMethods(client);return <div className={styles.page}><header className={styles.heading}><div><p>Commerce / Consegna</p><h1>Spedizioni</h1><span>{methods.length} metodi reali · aree ISO e stime tipizzate</span></div></header><div className={styles.stack}>{methods.map(method=><ShippingMethodForm key={method.id} method={method}/>) }<ShippingMethodForm method={null}/></div></div>}
