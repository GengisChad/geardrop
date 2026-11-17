import { redirect } from "next/navigation";
import { SupplierForm } from "@/components/admin/warehouse/supplier-form";
import styles from "@/components/admin/warehouse/warehouse.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { listSuppliers } from "@/lib/admin/warehouse-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SuppliersPage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const suppliers = await listSuppliers(client, principal.organization.id);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Magazzino / Acquisti</p>
          <h1>Fornitori</h1>
          <span>{suppliers.length} fornitori · il regime IVA decide come leggere le loro fatture</span>
        </div>
      </header>
      <div className={styles.suppliers}>
        {suppliers.map((supplier) => <SupplierForm key={supplier.id} supplier={supplier} />)}
        <SupplierForm supplier={null} />
      </div>
    </div>
  );
}
