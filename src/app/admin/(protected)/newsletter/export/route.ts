import { requireAdminAccess } from "@/lib/admin/access";
import { listNewsletterSubscribers } from "@/lib/admin/newsletter-repository";
import { csvOrderCell } from "@/lib/admin/orders";
import { newsletterUnsubscribeUrl } from "@/lib/newsletter/newsletter";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Confirmed subscribers only, each with the unsubscribe link that goes in every email to them. */
export async function GET() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") return new Response("Esportazione non autorizzata", { status: 403 });
  const list = await listNewsletterSubscribers(client);
  const body = [
    ["email", "confermato_il", "link_cancellazione"].join(","),
    ...list.confirmed.map((row) =>
      [csvOrderCell(row.email), csvOrderCell(row.confirmed_at), csvOrderCell(newsletterUnsubscribeUrl(PRODUCTION_ORIGIN, row.token))].join(","),
    ),
  ].join("\r\n");
  return new Response(`﻿${body}`, {
    headers: {
      "Content-Disposition": `attachment; filename="geardrop-newsletter-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
