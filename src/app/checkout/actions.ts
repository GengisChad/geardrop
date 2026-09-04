"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { domainMessage, GENERIC_ERROR } from "@/lib/supabase/errors";
import { checkoutSchema } from "@/lib/checkout-schema";

/**
 * Order creation.
 *
 * The payload carries identifiers and quantities — never a name, price, discount, shipping
 * cost or total. Everything financial is recomputed inside `public.create_order`, in one
 * transaction, from the database's own rows (design §8). A client that lies about a price
 * simply has its lie ignored.
 *
 * Two paths reach the same RPC:
 *   * signed in  → the request-scoped client, so `auth.uid()` inside the function is the
 *     customer and the order is attached to their history;
 *   * guest      → the server-only secret-key client, which has no user context, so the
 *     function always writes `customer_id = null`. The RPC is not callable with the
 *     publishable key by an anonymous browser at all.
 */

const lineSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  quantity: z.number().int().positive().max(100),
});

const payloadSchema = z.object({
  items: z.array(lineSchema).min(1, "Il carrello è vuoto.").max(50),
  idempotencyKey: z.uuid(),
  coupon: z.string().trim().max(32).optional(),
  form: checkoutSchema,
});

export type CheckoutPayload = z.infer<typeof payloadSchema>;

export type CheckoutResult =
  | {
      ok: true;
      orderNumber: string;
      totals: { subtotalCents: number; discountCents: number; shippingCents: number; totalCents: number };
    }
  | { ok: false; error: string };

type OrderSummaryJson = {
  order_number?: string;
  subtotal_cents?: number;
  discount_cents?: number;
  shipping_cents?: number;
  total_cents?: number;
};

export async function placeOrderAction(input: CheckoutPayload): Promise<CheckoutResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Gli ordini non sono ancora attivi: il backend non è configurato." };
  }

  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dati dell'ordine non validi." };
  }

  const { items, idempotencyKey, coupon, form } = parsed.data;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  // A guest checkout has no database identity, so it goes through the privileged client;
  // an authenticated one stays RLS-bound and keeps its auth.uid().
  const client = claims?.claims ? supabase : createAdminClient();

  const { data, error } = await client.rpc("create_order", {
    payload: {
      idempotency_key: idempotencyKey,
      items: items.map((item) => ({ slug: item.slug, quantity: item.quantity })),
      contact: { email: form.email, phone: form.phone },
      shipping_method: form.shippingMethod,
      coupon_code: coupon ?? null,
      notes: form.notes ?? null,
      shipping_address: {
        first_name: form.firstName,
        last_name: form.lastName,
        address: form.address,
        city: form.city,
        postal_code: form.postalCode,
        province: form.province,
        country: "IT",
        phone: form.phone,
      },
      billing_address: null,
    },
  });

  if (error) return { ok: false, error: domainMessage(error.message) };

  const summary = (data ?? {}) as OrderSummaryJson;
  if (!summary.order_number) return { ok: false, error: GENERIC_ERROR };

  return {
    ok: true,
    orderNumber: summary.order_number,
    totals: {
      subtotalCents: summary.subtotal_cents ?? 0,
      discountCents: summary.discount_cents ?? 0,
      shippingCents: summary.shipping_cents ?? 0,
      totalCents: summary.total_cents ?? 0,
    },
  };
}
