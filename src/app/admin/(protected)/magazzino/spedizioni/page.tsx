import { redirect } from "next/navigation";
import styles from "@/components/admin/fulfillment/fulfillment.module.css";
import { BulkShipments, type BulkShipmentRow } from "@/components/admin/fulfillment/bulk-shipments";
import { shippingMethodByCode } from "@/data/catalog";
import { requireAdminAccess } from "@/lib/admin/access";
import { selectedOrderIds, shippingAddress } from "@/lib/admin/fulfillment";
import { BULK_SHIPMENT_LIMIT, shipmentChoice } from "@/lib/admin/orders";
import { INPOST_CARRIER_LABEL } from "@/lib/orders/inpost-delivery";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// The batch action runs inside this page: up to 20 InPost shipments, each with its email.
export const maxDuration = 120;

/**
 * "Spedizioni in blocco" (owner, 2026-11-18): the orders ticked in "Da spedire", each with what
 * it needs for its InPost shipment, created all together; then one PDF with every label.
 */
export default async function BulkShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ids = selectedOrderIds((await searchParams).ordini).slice(0, BULK_SHIPMENT_LIMIT);
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  if (ids.length === 0) redirect("/admin/magazzino");
  const organizationId = principal.organization.id;

  const [orders, items] = await Promise.all([
    client
      .from("orders")
      .select("id,order_number,status,payment_status,shipping_method_code,tracking_carrier,tracking_code,shipping_address_snapshot")
      .eq("organization_id", organizationId)
      .in("id", [...ids])
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    client.from("order_items").select("order_id,quantity").eq("organization_id", organizationId).in("order_id", [...ids]),
  ]);
  if (orders.error || items.error) throw new Error("Impossibile caricare gli ordini scelti");

  const pieces = new Map<number, number>();
  for (const item of items.data ?? []) pieces.set(item.order_id, (pieces.get(item.order_id) ?? 0) + item.quantity);

  const rows: BulkShipmentRow[] = (orders.data ?? []).map((order) => {
    const choice = shipmentChoice(order.shipping_address_snapshot);
    const address = shippingAddress(order.shipping_address_snapshot);
    const inpost = shippingMethodByCode(choice.method ?? order.shipping_method_code)?.carrier === "inpost";
    const tracked = order.tracking_carrier === INPOST_CARRIER_LABEL && Boolean(order.tracking_code);
    const shippable = order.payment_status === "paid" && ["confirmed", "processing"].includes(order.status);
    const state: BulkShipmentRow["state"] = tracked
      ? "tracked"
      : !shippable
        ? "not-shippable"
        : !inpost
          ? "not-inpost"
          : choice.pickupPointId
            ? "ready"
            : "manual-locker";
    return {
      id: order.id,
      orderNumber: order.order_number,
      pieces: pieces.get(order.id) ?? 0,
      destination: [address.name, choice.pickupPoint ?? [address.postalCode, address.city].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
      state,
      trackingCode: tracked ? order.tracking_code : null,
    };
  });
  const ready = rows.filter((row) => row.state === "ready").length;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Magazzino / Spedizioni in blocco</p>
          <h1>Spedizioni InPost</h1>
          <span>
            {rows.length} ordini scelti · {ready} da creare qui · al massimo {BULK_SHIPMENT_LIMIT} per volta
          </span>
        </div>
      </header>
      <p className={styles.destination}>
        Ogni spedizione parte da Gear Drop Shop verso il Locker scelto dal cliente; l&rsquo;ordine passa a spedito e il cliente riceve
        l&rsquo;email con il tracking, come dalla scheda dell&rsquo;ordine. Controlla vano e peso prima di creare: una spedizione creata
        non si annulla da qui.
      </p>
      <BulkShipments rows={rows} />
    </div>
  );
}
