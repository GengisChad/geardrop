import { requireAdminAccess } from "@/lib/admin/access";
import { INPOST_CARRIER_LABEL } from "@/lib/orders/inpost-delivery";
import { createInpostClient, inpostConfig } from "@/lib/shipping/inpost";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /admin/ordini/[id]/etichetta — the InPost label of the order, A6 PDF, read from InPost each
 * time (nothing is stored). Staff only: the label carries the buyer's name and phone.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return new Response("Ordine non valido", { status: 404 });

  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") return new Response("Non autorizzato", { status: 403 });

  const order = await client.from("orders").select("order_number,tracking_carrier,tracking_code").eq("id", id).single();
  if (order.error || order.data.tracking_carrier !== INPOST_CARRIER_LABEL || !order.data.tracking_code) {
    return new Response("Nessuna spedizione InPost su questo ordine", { status: 404 });
  }
  const config = inpostConfig();
  if (!config?.organizationId) return new Response("InPost non è configurato", { status: 503 });

  try {
    const pdf = await createInpostClient(config).label(order.data.tracking_code);
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="etichetta-${order.data.order_number}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[inpost-label]", error instanceof Error ? error.message : error);
    return new Response("InPost non ha restituito l'etichetta. Riprova tra poco.", { status: 502 });
  }
}
