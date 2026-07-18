"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { couponIdSchema, couponSchema } from "@/lib/admin/coupons";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type CouponActionState = { readonly ok: boolean; readonly message: string };
const MANAGER_ROLES = ["owner", "admin"] as const;
const text = (data: FormData, key: string) => typeof data.get(key) === "string" ? String(data.get(key)) : "";
const checked = (data: FormData, key: string) => ["on", "true", "1"].includes(text(data, key));
const date = (data: FormData, key: string) => { const value = text(data, key).trim(); return value ? new Date(value).toISOString() : null; };
const euros = (data: FormData, key: string) => Math.round(Number(text(data, key).replace(",", ".") || 0) * 100);
const nullableInteger = (data: FormData, key: string) => text(data, key).trim() ? Number(text(data, key)) : null;
const nullableEuros = (data: FormData, key: string) => text(data, key).trim() ? euros(data, key) : null;
const ids = (data: FormData, key: string) => data.getAll(key).map(String);
async function managerClient() { const client = await createSupabaseServerClient(); await requireUser(client); await requireStaffRole(client, MANAGER_ROLES); return client; }
function refresh() { revalidateTag("coupons", "max"); revalidateTag("products", "max"); revalidatePath("/admin/coupon"); revalidatePath("/checkout"); }

async function syncTargets(client: Awaited<ReturnType<typeof createSupabaseServerClient>>, couponId: number, input: { productIds: number[]; categoryIds: number[]; bundleIds: number[] }) {
  const deleted = await Promise.all([client.from("coupon_products").delete().eq("coupon_id", couponId), client.from("coupon_categories").delete().eq("coupon_id", couponId), client.from("coupon_bundles").delete().eq("coupon_id", couponId)]);
  if (deleted.some((result) => result.error)) return false;
  const inserted = await Promise.all([
    input.productIds.length ? client.from("coupon_products").insert(input.productIds.map((product_id) => ({ coupon_id: couponId, product_id }))) : Promise.resolve({ error: null }),
    input.categoryIds.length ? client.from("coupon_categories").insert(input.categoryIds.map((category_id) => ({ coupon_id: couponId, category_id }))) : Promise.resolve({ error: null }),
    input.bundleIds.length ? client.from("coupon_bundles").insert(input.bundleIds.map((bundle_id) => ({ coupon_id: couponId, bundle_id }))) : Promise.resolve({ error: null }),
  ]);
  return inserted.every((result) => !result.error);
}

export async function saveCouponAction(_previous: CouponActionState, formData: FormData): Promise<CouponActionState> {
  const kind = text(formData, "discountKind");
  const parsed = couponSchema.safeParse({ id: text(formData, "id") || undefined, code: text(formData, "code"), discountKind: kind, discountValue: kind === "percentage" ? Number(text(formData, "discountValue")) : euros(formData, "discountValue"), freeShipping: checked(formData, "freeShipping"), minimumSubtotalCents: euros(formData, "minimumSubtotal"), maximumDiscountCents: nullableEuros(formData, "maximumDiscount"), usageLimit: nullableInteger(formData, "usageLimit"), perCustomerLimit: nullableInteger(formData, "perCustomerLimit"), firstPurchaseOnly: checked(formData, "firstPurchaseOnly"), startsAt: date(formData, "startsAt"), expiresAt: date(formData, "expiresAt"), active: checked(formData, "active"), productIds: ids(formData, "productIds"), categoryIds: ids(formData, "categoryIds"), bundleIds: ids(formData, "bundleIds") });
  if (!parsed.success) return { ok: false, message: "Controlla codice, sconto, limiti, date e target." };
  const client = await managerClient(); const input = parsed.data;
  const record: Database["public"]["Tables"]["coupons"]["Insert"] = { code: input.code, discount_kind: input.discountKind, discount_value: input.discountValue, free_shipping: input.freeShipping, minimum_subtotal_cents: input.minimumSubtotalCents, maximum_discount_cents: input.maximumDiscountCents, usage_limit: input.usageLimit, per_customer_limit: input.perCustomerLimit, first_purchase_only: input.firstPurchaseOnly, starts_at: input.startsAt, expires_at: input.expiresAt, active: input.active, disabled_at: null };
  const saved = input.id ? await client.from("coupons").update(record).eq("id", input.id).select("id").single() : await client.from("coupons").insert(record).select("id").single();
  if (saved.error || !await syncTargets(client, saved.data.id, input)) return { ok: false, message: "Coupon non salvato. Verifica codice e target reali." };
  refresh(); if (!input.id) redirect(`/admin/coupon/${saved.data.id}?created=1`); return { ok: true, message: "Coupon salvato." };
}

export async function disableCouponAction(formData: FormData): Promise<void> { const id = couponIdSchema.parse(text(formData, "id")); const client = await managerClient(); const result = await client.from("coupons").update({ active: false, disabled_at: new Date().toISOString() }).eq("id", id); if (result.error) throw new Error("Coupon non disabilitato"); refresh(); }

export async function duplicateCouponAction(formData: FormData): Promise<void> {
  const id = couponIdSchema.parse(text(formData, "id")); const client = await managerClient();
  const source = await client.from("coupons").select("*").eq("id", id).single(); if (source.error) throw new Error("Coupon origine non trovato");
  const { id: _id, created_at: _created, updated_at: _updated, used_count: _used, ...copy } = source.data;
  const inserted = await client.from("coupons").insert({ ...copy, code: `${source.data.code}-COPIA`, active: false, disabled_at: null, used_count: 0 }).select("id").single();
  if (inserted.error) throw new Error("Duplica non riuscita: modifica prima il codice della copia esistente");
  const [products, categories, bundles] = await Promise.all([client.from("coupon_products").select("product_id").eq("coupon_id", id), client.from("coupon_categories").select("category_id").eq("coupon_id", id), client.from("coupon_bundles").select("bundle_id").eq("coupon_id", id)]);
  if (!await syncTargets(client, inserted.data.id, { productIds: products.data?.map((item) => item.product_id) ?? [], categoryIds: categories.data?.map((item) => item.category_id) ?? [], bundleIds: bundles.data?.map((item) => item.bundle_id) ?? [] })) throw new Error("Target copia non salvati");
  refresh(); redirect(`/admin/coupon/${inserted.data.id}?duplicated=1`);
  void _id; void _created; void _updated; void _used;
}
