"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession, type StaffRole } from "@/lib/auth/session";
import { domainMessage, GENERIC_ERROR } from "@/lib/supabase/errors";

/**
 * Back-office mutations.
 *
 * Two layers guard every one of them. These actions re-check the caller's staff role
 * (`getStaffSession`) so the UI can show a real message, and the database enforces the
 * same rule independently — RLS policies for plain writes, an in-function role check for
 * the SECURITY DEFINER RPCs. Removing the check here would change the error text, not the
 * security boundary.
 */

export type AdminFormState = {
  readonly error?: string;
  readonly notice?: string;
};

const FORBIDDEN: AdminFormState = { error: "Non hai i permessi per questa operazione." };

async function requireRole(minimum: StaffRole) {
  const session = await getStaffSession(minimum);
  return session;
}

const int = z.coerce.number().int();

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const orderStatusSchema = z.object({
  orderId: int.positive(),
  status: z.enum(["pending", "confirmed", "fulfilled", "cancelled", "refunded"]),
  paymentStatus: z.enum(["unpaid", "paid", "refunded"]),
  note: z.string().trim().max(300).optional(),
});

/**
 * Lifecycle change. The stock consequence of the transition (returning units on cancel,
 * taking them back when a cancelled order is reopened) happens inside the RPC's
 * transaction, so it can never half-apply.
 */
export async function setOrderStatusAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  if (!(await requireRole("admin"))) return FORBIDDEN;

  const parsed = orderStatusSchema.safeParse({
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    paymentStatus: formData.get("paymentStatus"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return { error: "Dati non validi." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_order_status", {
    p_order_id: parsed.data.orderId,
    p_status: parsed.data.status,
    p_payment_status: parsed.data.paymentStatus,
    p_note: parsed.data.note ?? null,
  });

  if (error) return { error: domainMessage(error.message) };

  revalidatePath("/admin/ordini");
  revalidatePath(`/admin/ordini/${parsed.data.orderId}`);
  return { notice: "Ordine aggiornato." };
}

// ---------------------------------------------------------------------------
// Inventory and catalogue
// ---------------------------------------------------------------------------

const stockSchema = z.object({
  productId: int.positive(),
  delta: int.refine((value) => value !== 0, "Indica una quantità diversa da zero."),
  reason: z.enum(["restock", "adjustment", "return"]),
  note: z.string().trim().max(200).optional(),
});

export async function adjustStockAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  if (!(await requireRole("admin"))) return FORBIDDEN;

  const parsed = stockSchema.safeParse({
    productId: formData.get("productId"),
    delta: formData.get("delta"),
    reason: formData.get("reason") ?? "adjustment",
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return { error: "Quantità non valida." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_adjust_stock", {
    p_product_id: parsed.data.productId,
    p_delta: parsed.data.delta,
    p_reason: parsed.data.reason,
    p_note: parsed.data.note ?? null,
  });

  if (error) return { error: domainMessage(error.message) };

  revalidatePath("/admin/catalogo");
  return { notice: "Magazzino aggiornato." };
}

const productSchema = z.object({
  productId: int.positive(),
  publicationStatus: z.enum(["draft", "published", "archived"]),
  active: z.coerce.boolean(),
  stockStatus: z.enum(["disponibile", "in-arrivo", "pre-ordine", "esaurito"]),
  priceCents: int.min(0).max(10_000_000),
});

/** Catalogue content is an editor-level plain UPDATE; the RLS policy is the real gate. */
export async function updateProductAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  if (!(await requireRole("editor"))) return FORBIDDEN;

  const parsed = productSchema.safeParse({
    productId: formData.get("productId"),
    publicationStatus: formData.get("publicationStatus"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
    stockStatus: formData.get("stockStatus"),
    priceCents: formData.get("priceCents"),
  });
  if (!parsed.success) return { error: "Dati prodotto non validi." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({
      publication_status: parsed.data.publicationStatus,
      active: parsed.data.active,
      stock_status: parsed.data.stockStatus,
      price_cents: parsed.data.priceCents,
    })
    .eq("id", parsed.data.productId);

  if (error) return { error: GENERIC_ERROR };

  revalidatePath("/admin/catalogo");
  revalidatePath("/negozio");
  return { notice: "Prodotto aggiornato." };
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "Codice troppo corto.")
    .max(32, "Codice troppo lungo.")
    .regex(/^[A-Za-z0-9_-]+$/, "Usa solo lettere, numeri, - e _.")
    .transform((value) => value.toUpperCase()),
  discountKind: z.enum(["fixed", "percentage"]),
  discountValue: int.positive(),
  minSubtotalCents: int.min(0).optional(),
  maxRedemptions: int.positive().optional(),
  active: z.coerce.boolean(),
});

export async function upsertCouponAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  if (!(await requireRole("admin"))) return FORBIDDEN;

  const raw = {
    code: formData.get("code"),
    discountKind: formData.get("discountKind"),
    discountValue: formData.get("discountValue"),
    minSubtotalCents: formData.get("minSubtotalCents") || undefined,
    maxRedemptions: formData.get("maxRedemptions") || undefined,
    active: formData.get("active") === "on" || formData.get("active") === "true",
  };

  const parsed = couponSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dati coupon non validi." };

  // A percentage discount is a percentage: the database check constraint agrees, but
  // failing here gives a usable message instead of a constraint violation.
  if (parsed.data.discountKind === "percentage" && parsed.data.discountValue > 100) {
    return { error: "Uno sconto percentuale non può superare 100." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("coupons").upsert(
    {
      code: parsed.data.code,
      discount_kind: parsed.data.discountKind,
      discount_value: parsed.data.discountValue,
      min_subtotal_cents: parsed.data.minSubtotalCents ?? null,
      max_redemptions: parsed.data.maxRedemptions ?? null,
      active: parsed.data.active,
    },
    { onConflict: "code" },
  );

  if (error) return { error: GENERIC_ERROR };

  revalidatePath("/admin/coupon");
  return { notice: `Coupon ${parsed.data.code} salvato.` };
}

export async function toggleCouponAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  if (!(await requireRole("admin"))) return FORBIDDEN;

  const id = int.positive().safeParse(formData.get("couponId"));
  const active = formData.get("active") === "true";
  if (!id.success) return { error: "Coupon non valido." };

  const supabase = await createClient();
  const { error } = await supabase.from("coupons").update({ active }).eq("id", id.data);
  if (error) return { error: GENERIC_ERROR };

  revalidatePath("/admin/coupon");
  return { notice: active ? "Coupon attivato." : "Coupon disattivato." };
}

// ---------------------------------------------------------------------------
// Shipping and store settings
// ---------------------------------------------------------------------------

const shippingSchema = z.object({
  code: z.string().trim().min(1).max(32),
  label: z.string().trim().min(1).max(80),
  deliveryHint: z.string().trim().max(120).optional(),
  priceCents: int.min(0).max(100_000),
  freeShippingThresholdCents: int.min(0).max(10_000_000).optional(),
  active: z.coerce.boolean(),
});

export async function upsertShippingMethodAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  if (!(await requireRole("admin"))) return FORBIDDEN;

  const parsed = shippingSchema.safeParse({
    code: formData.get("code"),
    label: formData.get("label"),
    deliveryHint: formData.get("deliveryHint") || undefined,
    priceCents: formData.get("priceCents"),
    freeShippingThresholdCents: formData.get("freeShippingThresholdCents") || undefined,
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) return { error: "Dati spedizione non validi." };

  const supabase = await createClient();
  const { error } = await supabase.from("shipping_methods").upsert(
    {
      code: parsed.data.code,
      label: parsed.data.label,
      delivery_hint: parsed.data.deliveryHint ?? "",
      price_cents: parsed.data.priceCents,
      free_shipping_threshold_cents: parsed.data.freeShippingThresholdCents ?? null,
      active: parsed.data.active,
    },
    { onConflict: "code" },
  );

  if (error) return { error: GENERIC_ERROR };

  revalidatePath("/admin/spedizioni");
  return { notice: "Metodo di spedizione salvato." };
}

const settingsSchema = z.object({
  checkoutEnabled: z.coerce.boolean(),
  maxQuantityPerLine: int.min(1).max(100),
});

/**
 * The kill switch for selling. `create_order` reads this row inside its transaction, so
 * turning checkout off stops new orders immediately rather than only hiding the button.
 */
export async function updateStoreSettingsAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  if (!(await requireRole("admin"))) return FORBIDDEN;

  const parsed = settingsSchema.safeParse({
    checkoutEnabled: formData.get("checkoutEnabled") === "on" || formData.get("checkoutEnabled") === "true",
    maxQuantityPerLine: formData.get("maxQuantityPerLine"),
  });
  if (!parsed.success) return { error: "Impostazioni non valide." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("store_settings")
    .update({
      checkout_enabled: parsed.data.checkoutEnabled,
      max_quantity_per_line: parsed.data.maxQuantityPerLine,
    })
    .eq("id", 1);

  if (error) return { error: GENERIC_ERROR };

  revalidatePath("/admin/spedizioni");
  revalidatePath("/checkout");
  return { notice: parsed.data.checkoutEnabled ? "Vendite aperte." : "Vendite chiuse." };
}

// ---------------------------------------------------------------------------
// Staff (owner only)
// ---------------------------------------------------------------------------

const staffSchema = z.object({
  email: z.email({ message: "Inserisci un'email valida." }).trim(),
  role: z.enum(["owner", "admin", "editor"]),
  active: z.coerce.boolean(),
});

export async function upsertStaffAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  if (!(await requireRole("owner"))) return FORBIDDEN;

  const parsed = staffSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("owner_upsert_staff", {
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_active: parsed.data.active,
  });

  if (error) return { error: domainMessage(error.message) };

  revalidatePath("/admin/staff");
  return { notice: "Permessi aggiornati." };
}
