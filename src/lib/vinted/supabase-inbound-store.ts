import "server-only";

import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { AppliedLine, InboundStore } from "./process-inbound";

/**
 * The Vinted sync's storage. Like the Stripe webhook it runs with the secret key — no one is
 * signed in when Resend calls — and it can only reach the three functions granted to that key.
 */
export function createSupabaseInboundStore(client = createPrivilegedSupabaseClient()): InboundStore {
  return {
    async ingest(input) {
      const result = await client.rpc("ingest_inbound_email", {
        p_provider_email_id: input.providerEmailId,
        p_from: input.from,
        p_subject: input.subject,
        p_body: input.body,
        p_sender_verified: input.senderVerified,
        ...(input.sale
          ? {
              p_sale: {
                buyer_username: input.sale.buyerUsername,
                listing_title: input.sale.listingTitle,
                item_count: input.sale.itemCount,
                amount_cents: input.sale.amountCents,
                ...(input.sale.soldAt ? { sold_at: input.sale.soldAt } : {}),
              },
            }
          : {}),
      });
      const row = result.data?.[0];
      if (result.error || !row) throw new Error(`ingest_inbound_email: ${result.error?.message ?? "no row"}`);
      return { inboundId: row.inbound_id, saleId: row.sale_id ?? null, created: row.created };
    },
    async suggest(saleId, suggestion) {
      const { error } = await client.rpc("set_vinted_sale_suggestion", {
        p_sale_id: saleId,
        p_suggestion: suggestion as unknown as Json,
      });
      if (error) throw new Error(`set_vinted_sale_suggestion: ${error.message}`);
    },
    async autoApply(saleId, lines) {
      const { data, error } = await client.rpc("auto_apply_vinted_sale", {
        p_sale_id: saleId,
        p_lines: lines.map((line) => ({ slug: line.slug, quantity: line.quantity })),
      });
      if (error) throw new Error(`auto_apply_vinted_sale: ${error.message}`);
      return (Array.isArray(data) ? data : []) as unknown as readonly AppliedLine[];
    },
  };
}
