"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { promotionIdSchema, promotionSchema } from "@/lib/admin/promotions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PromotionActionState = { readonly ok: boolean; readonly message: string };
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
const ids = (data: FormData, key: string) => data.getAll(key).map(String);
async function managerClient() { const client = await createSupabaseServerClient(); await requireUser(client); await requireStaffRole(client, MANAGER_ROLES); return client; }
function refresh() { revalidateTag("products", "max"); revalidateTag("promotions", "max"); revalidatePath("/admin/promozioni"); revalidatePath("/negozio"); revalidatePath("/"); }

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
  const saved = await client.rpc("save_promotion_with_targets", {
    p_promotion: {
      id: input.id ?? null, name: input.name, description: input.description,
      discount_kind: input.discountKind, discount_value: input.discountValue,
      minimum_subtotal_cents: input.minimumSubtotalCents, minimum_quantity: input.minimumQuantity,
      priority: input.priority, stackable: input.stackable, starts_at: input.startsAt,
      ends_at: input.endsAt, active: input.active,
    },
    p_product_ids: input.productIds,
    p_category_ids: input.categoryIds,
    p_bundle_ids: input.bundleIds,
  });
  if (saved.error) return { ok: false, message: "Promozione non salvata. Verifica i target reali." };
  refresh();
  if (!input.id) redirect(`/admin/promozioni/${saved.data}?created=1`);
  return { ok: true, message: "Promozione salvata." };
}

export async function togglePromotionAction(formData: FormData): Promise<void> {
  const id = promotionIdSchema.parse(text(formData, "id")); const client = await managerClient();
  const current = await client.from("promotions").select("active").eq("id", id).single();
  if (current.error || (await client.from("promotions").update({ active: !current.data.active }).eq("id", id)).error) throw new Error("Stato promozione non aggiornato");
  refresh();
}
