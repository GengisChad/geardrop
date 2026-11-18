import { notFound, redirect } from "next/navigation";
import { PackCheck, type PackCheckLine } from "@/components/admin/barcodes/pack-check";
import styles from "@/components/admin/barcodes/barcodes.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** "Controlla pacco" (owner, 2026-11-18): scan every piece of one order before closing the box. */
export default async function PackCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const organizationId = principal.organization.id;

  const [order, items] = await Promise.all([
    client.from("orders").select("id,order_number,status").eq("id", id).eq("organization_id", organizationId).maybeSingle(),
    client
      .from("order_items")
      .select("id,product_id,product_name_snapshot,sku_snapshot,quantity,image_src_snapshot")
      .eq("order_id", id)
      .eq("organization_id", organizationId)
      .order("id"),
  ]);
  if (order.error || items.error) throw new Error("Impossibile caricare l'ordine");
  if (!order.data) notFound();

  const productIds = [...new Set((items.data ?? []).flatMap((item) => (item.product_id ? [item.product_id] : [])))];
  const products = productIds.length
    ? await client.from("products").select("id,gtin").eq("organization_id", organizationId).in("id", productIds)
    : { data: [], error: null };
  if (products.error) throw new Error("Impossibile caricare i codici dei prodotti");
  const gtins = new Map((products.data ?? []).map((product) => [product.id, product.gtin]));

  const lines: PackCheckLine[] = (items.data ?? []).map((item) => ({
    key: String(item.id),
    name: item.product_name_snapshot,
    sku: item.sku_snapshot,
    gtin: item.product_id ? (gtins.get(item.product_id) ?? null) : null,
    expected: item.quantity,
    imageSrc: item.image_src_snapshot,
  }));
  const pieces = lines.reduce((sum, line) => sum + line.expected, 0);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Magazzino / Controllo pacco</p>
          <h1>{order.data.order_number}</h1>
          <span>
            {pieces} {pieces === 1 ? "pezzo" : "pezzi"} da mettere nel pacco
          </span>
        </div>
      </header>
      <p className={styles.intro}>
        Passa ogni pezzo davanti al lettore o alla fotocamera mentre lo metti nella scatola. Va bene il codice a barre della scatola
        (EAN) o l&rsquo;etichetta GEAR//DROP con lo SKU.
      </p>
      <PackCheck lines={lines} orderId={order.data.id} orderNumber={order.data.order_number} />
    </div>
  );
}
