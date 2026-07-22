"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { couponIdSchema, couponSchema } from "@/lib/admin/coupons";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CouponActionState = { readonly ok: boolean; readonly message: string };
const MANAGER_ROLES = ["owner", "admin"] as const;
const text = (data: FormData, key: string) => typeof data.get(key) === "string" ? String(data.get(key)) : "";
const checked = (data: FormData, key: string) => ["on", "true", "1"].includes(text(data, key));
const date = (data: FormData, key: string) => {
  const value = text(data, key).trim();
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};
const euros = (data: FormData, key: string) => Math.round(Number(text(data, key).replace(",", ".") || 0) * 100);
const nullableInteger = (data: FormData, key: string) => text(data, key).trim() ? Number(text(data, key)) : null;
const nullableEuros = (data: FormData, key: string) => text(data, key).trim() ? euros(data, key) : null;
const ids = (data: FormData, key: string) => data.getAll(key).map(String);
async function managerClient() { const client = await createSupabaseServerClient(); await requireUser(client); await requireStaffRole(client, MANAGER_ROLES); return client; }
function refresh() { revalidateTag("coupons", "max"); revalidateTag("products", "max"); revalidatePath("/admin/coupon"); revalidatePath("/checkout"); }

export async function saveCouponAction(_previous: CouponActionState, formData: FormData): Promise<CouponActionState> {
  const kind = text(formData, "discountKind");
  const parsed = couponSchema.safeParse({ id: text(formData, "id") || undefined, code: text(formData, "code"), discountKind: kind, discountValue: kind === "percentage" ? Number(text(formData, "discountValue")) : euros(formData, "discountValue"), freeShipping: checked(formData, "freeShipping"), minimumSubtotalCents: euros(formData, "minimumSubtotal"), maximumDiscountCents: nullableEuros(formData, "maximumDiscount"), usageLimit: nullableInteger(formData, "usageLimit"), perCustomerLimit: nullableInteger(formData, "perCustomerLimit"), firstPurchaseOnly: checked(formData, "firstPurchaseOnly"), startsAt: date(formData, "startsAt"), expiresAt: date(formData, "expiresAt"), active: checked(formData, "active"), productIds: ids(formData, "productIds"), categoryIds: ids(formData, "categoryIds"), bundleIds: ids(formData, "bundleIds") });
  if (!parsed.success) return { ok: false, message: "Controlla codice, sconto, limiti, date e target." };
  const client = await managerClient(); const input = parsed.data;
  const saved = await client.rpc("save_coupon_with_targets", {
    p_coupon: {
      id: input.id ?? null, code: input.code, discount_kind: input.discountKind,
      discount_value: input.discountValue, free_shipping: input.freeShipping,
      minimum_subtotal_cents: input.minimumSubtotalCents,
      maximum_discount_cents: input.maximumDiscountCents, usage_limit: input.usageLimit,
      per_customer_limit: input.perCustomerLimit, first_purchase_only: input.firstPurchaseOnly,
      starts_at: input.startsAt, expires_at: input.expiresAt, active: input.active,
    },
    p_product_ids: input.productIds,
    p_category_ids: input.categoryIds,
    p_bundle_ids: input.bundleIds,
  });
  if (saved.error) return { ok: false, message: "Coupon non salvato. Verifica codice e target reali." };
  refresh(); if (!input.id) redirect(`/admin/coupon/${saved.data}?created=1`); return { ok: true, message: "Coupon salvato." };
}

export async function disableCouponAction(formData: FormData): Promise<void> { const id = couponIdSchema.parse(text(formData, "id")); const client = await managerClient(); const result = await client.from("coupons").update({ active: false, disabled_at: new Date().toISOString() }).eq("id", id); if (result.error) throw new Error("Coupon non disabilitato"); refresh(); }

export async function duplicateCouponAction(formData: FormData): Promise<void> {
  const id = couponIdSchema.parse(text(formData, "id")); const client = await managerClient();
  const inserted = await client.rpc("duplicate_coupon_with_targets", { p_coupon_id: id });
  if (inserted.error) throw new Error("Duplica non riuscita: modifica prima il codice della copia esistente");
  refresh(); redirect(`/admin/coupon/${inserted.data}?duplicated=1`);
}
