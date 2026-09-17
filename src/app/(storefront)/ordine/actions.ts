"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrderLookupResult =
  | {
      readonly ok: true;
      readonly order: {
        readonly order_number: string;
        readonly status: string;
        readonly created_at: string;
        readonly shipped_at: string | null;
        readonly tracking_carrier: string | null;
        readonly tracking_code: string | null;
        readonly tracking_url: string | null;
        readonly items: readonly {
          readonly product_name_snapshot: string;
          readonly quantity: number;
          readonly preorder_quantity: number;
        }[];
      };
    }
  | { readonly ok: false; readonly message: string };

const lookupSchema = z.object({
  orderNumber: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(320),
});

export async function lookupOrderAction(
  _previous: OrderLookupResult | null,
  formData: FormData,
): Promise<OrderLookupResult> {
  const parsed = lookupSchema.safeParse({
    orderNumber: formData.get("orderNumber"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { ok: false, message: "Non troviamo un ordine con questi dati." };
  }

  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc("lookup_order_status", {
      p_order_number: parsed.data.orderNumber,
      p_email: parsed.data.email,
    });

    if (error) {
      return { ok: false, message: "Non troviamo un ordine con questi dati." };
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      return { ok: false, message: "Non troviamo un ordine con questi dati." };
    }

    const rawItems = Array.isArray(row.items) ? row.items : [];
    return {
      ok: true,
      order: {
        order_number: String(row.order_number),
        status: String(row.status),
        created_at: String(row.created_at),
        shipped_at: row.shipped_at ? String(row.shipped_at) : null,
        tracking_carrier: row.tracking_carrier ? String(row.tracking_carrier) : null,
        tracking_code: row.tracking_code ? String(row.tracking_code) : null,
        tracking_url: row.tracking_url ? String(row.tracking_url) : null,
        items: rawItems.map((item) => {
          const row = (typeof item === "object" && item !== null && !Array.isArray(item)) ? item as Record<string, unknown> : {};
          return {
            product_name_snapshot: String(row["product_name_snapshot"] ?? ""),
            quantity: Number(row["quantity"] ?? 0),
            preorder_quantity: Number(row["preorder_quantity"] ?? 0),
          };
        }),
      },
    };
  } catch {
    return { ok: false, message: "Non troviamo un ordine con questi dati." };
  }
}
