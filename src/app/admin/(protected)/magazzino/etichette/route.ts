import { requireAdminAccess } from "@/lib/admin/access";
import { selectedOrderIds } from "@/lib/admin/fulfillment";
import { INPOST_CARRIER_LABEL } from "@/lib/orders/inpost-delivery";
import { createInpostClient, inpostConfig } from "@/lib/shipping/inpost";
import { labelSheet, labelSheetFormat } from "@/lib/shipping/label-sheet";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /admin/magazzino/etichette?ordini=1,2,3&formato=a4|a6 — every InPost label of the chosen
 * orders in one PDF (owner, 2026-11-18: "spedizioni in blocco"). Orders without an InPost
 * shipment are left out. Labels are read from InPost each time, nothing is stored; staff only,
 * because a label carries the buyer's name and phone. If InPost fails on one label the whole
 * answer is an error, so a missing label never goes unnoticed in a printed batch.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ids = selectedOrderIds(url.searchParams.getAll("ordini"));
  if (ids.length === 0) return new Response("Nessun ordine scelto", { status: 404 });

  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") return new Response("Non autorizzato", { status: 403 });

  const orders = await client
    .from("orders")
    .select("order_number,tracking_code")
    .eq("organization_id", principal.organization.id)
    .eq("tracking_carrier", INPOST_CARRIER_LABEL)
    .not("tracking_code", "is", null)
    .in("id", [...ids])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (orders.error) return new Response("Non riesco a leggere gli ordini.", { status: 500 });
  const tracked = (orders.data ?? []).flatMap((order) => (order.tracking_code ? [{ number: order.order_number, code: order.tracking_code }] : []));
  if (tracked.length === 0) return new Response("Nessuna spedizione InPost tra gli ordini scelti", { status: 404 });

  const config = inpostConfig();
  if (!config?.organizationId) return new Response("InPost non è configurato", { status: 503 });
  const inpost = createInpostClient(config);

  const labels: ArrayBuffer[] = [];
  for (const order of tracked) {
    try {
      labels.push(await inpost.label(order.code));
    } catch (error) {
      console.error("[inpost-labels]", order.number, error instanceof Error ? error.message : error);
      return new Response(`InPost non ha restituito l'etichetta di ${order.number}. Riprova tra poco.`, { status: 502 });
    }
  }

  const format = labelSheetFormat(url.searchParams.get("formato"));
  const pdf = await labelSheet(labels, format);
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
  return new Response(pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="etichette-inpost-${day}-${format}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
