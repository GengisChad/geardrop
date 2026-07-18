"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { promotionIdSchema, promotionSchema } from "@/lib/admin/promotions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type PromotionActionState = { readonly ok: boolean; readonly message: string };
const MANAGER_ROLES = ["owner", "admin"] as const;
const text = (data: FormData, key: string) => typeof data.get(key) === "string" ? String(data.get(key)) : "";
const checked = (data: FormData, key: string) => ["on", "true", "1"].includes(text(data, key));
const date = (data: FormData, key: string) => { const value = text(data, key).trim(); return value ? new Date(value).toISOString() : null; };
const euros = (data: FormData, key: string) => Math.round(Number(text(data, key).replace(",", ".") || 0) * 100);
const ids = (data: FormData, key: string) => data.getAll(key).map(String);
async function managerClient() { const client = await createSupabaseServerClient(); await requireUser(client); await requireStaffRole(client, MANAGER_ROLES); return client; }
function refresh() { revalidateTag("products", "max"); revalidateTag("promotions", "max"); revalidatePath("/admin/promozioni"); revalidatePath("/negozio"); revalidatePath("/"); }

async function syncTargets(client: Awaited<ReturnType<typeof createSupabaseServerClient>>, promotionId: number, input: { productIds: number[]; categoryIds: number[]; bundleIds: number[] }) {
  const deleted = await Promise.all([
    client.from("promotion_products").delete().eq("promotion_id", promotionId),
    client.from("promotion_categories").delete().eq("promotion_id", promotionId),
    client.from("promotion_bundles").delete().eq("promotion_id", promotionId),
  ]);
  if (deleted.some((result) => result.error)) return false;
  const inserted = await Promise.all([
    input.productIds.length ? client.from("promotion_products").insert(input.productIds.map((product_id) => ({ promotion_id: promotionId, product_id }))) : Promise.resolve({ error: null }),
    input.categoryIds.length ? client.from("promotion_categories").insert(input.categoryIds.map((category_id) => ({ promotion_id: promotionId, category_id }))) : Promise.resolve({ error: null }),
    input.bundleIds.length ? client.from("promotion_bundles").insert(input.bundleIds.map((bundle_id) => ({ promotion_id: promotionId, bundle_id }))) : Promise.resolve({ error: null }),
  ]);
  return inserted.every((result) => !result.error);
}

export async function savePromotionAction(_previous: PromotionActionState, formData: FormData): Promise<PromotionActionState> {
  const kind = text(formData, "discountKind");
  const parsed = promotionSchema.safeParse({
    id: text(formData, "id") || undefined, name: text(formData, "name"), description: text(formData, "description") || null,
    discountKind: kind, discountValue: kind === "percentage" ? Number(text(formData, "discountValue")) : euros(formData, "discountValue"),
    minimumSubtotalCents: euros(formData, "minimumSubtotal"), minimumQuantity: Number(text(formData, "minimumQuantity")),
    priority: Number(text(formData, "priority")), stackable: checked(formData, "stackable"), startsAt: date(formData, "startsAt"), endsAt: date(formData, "endsAt"), active: checked(formData, "active"),
    productIds: ids(formData, "productIds"), categoryIds: ids(formData, "categoryIds"), bundleIds: ids(formData, "bundleIds"),
  });
  if (!parsed.success) return { ok: false, message: "Controlla sconto, regole, date e target." };
  const client = await managerClient(); const input = parsed.data;
  const record: Database["public"]["Tables"]["promotions"]["Insert"] = { name: input.name, description: input.description, discount_kind: input.discountKind, discount_value: input.discountValue, minimum_subtotal_cents: input.minimumSubtotalCents, minimum_quantity: input.minimumQuantity, priority: input.priority, stackable: input.stackable, starts_at: input.startsAt, ends_at: input.endsAt, active: input.active };
  const saved = input.id ? await client.from("promotions").update(record).eq("id", input.id).select("id").single() : await client.from("promotions").insert(record).select("id").single();
  if (saved.error || !await syncTargets(client, saved.data.id, input)) return { ok: false, message: "Promozione non salvata. Verifica i target reali." };
  refresh();
  if (!input.id) redirect(`/admin/promozioni/${saved.data.id}?created=1`);
  return { ok: true, message: "Promozione salvata." };
}

export async function togglePromotionAction(formData: FormData): Promise<void> {
  const id = promotionIdSchema.parse(text(formData, "id")); const client = await managerClient();
  const current = await client.from("promotions").select("active").eq("id", id).single();
  if (current.error || (await client.from("promotions").update({ active: !current.data.active }).eq("id", id)).error) throw new Error("Stato promozione non aggiornato");
  refresh();
}
