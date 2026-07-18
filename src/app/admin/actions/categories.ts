"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { categoryEditorSchema, categoryIdSchema, categoryIdsSchema } from "@/lib/admin/categories";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type CategoryActionState = { readonly ok: boolean; readonly message: string };
type CategoryInsert = Database["public"]["Tables"]["categories"]["Insert"];

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function nullableText(formData: FormData, key: string): string | null {
  return text(formData, key).trim() || null;
}

function nullableNumber(formData: FormData, key: string): number | null {
  const value = text(formData, key).trim();
  return value ? Number(value) : null;
}

function checked(formData: FormData, key: string): boolean {
  return ["on", "true", "1"].includes(text(formData, key));
}

async function verifiedStaff() {
  const client = await createSupabaseServerClient();
  await requireUser(client);
  await requireStaffRole(client, STAFF_ROLES);
  return client;
}

function refreshCategories(slug?: string): void {
  revalidateTag("categories", "max");
  revalidateTag("products", "max");
  revalidateTag("media", "max");
  revalidatePath("/admin/categorie");
  revalidatePath("/negozio");
  revalidatePath("/");
  if (slug) revalidatePath(`/negozio/${slug}`);
}

export async function saveCategoryAction(
  _previous: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const intent = text(formData, "intent");
  const publicationStatus = intent === "publish" ? "published" : intent === "archive" ? "archived" : "draft";
  const parsed = categoryEditorSchema.safeParse({
    name: text(formData, "name"),
    slug: text(formData, "slug"),
    tagline: text(formData, "tagline"),
    description: text(formData, "description"),
    mediaAssetId: nullableNumber(formData, "mediaAssetId"),
    publicationStatus,
    active: intent === "publish" ? true : intent === "archive" ? false : checked(formData, "active"),
    seoTitle: nullableText(formData, "seoTitle"),
    seoDescription: nullableText(formData, "seoDescription"),
    sortOrder: Number(text(formData, "sortOrder")),
  });
  const parsedId = text(formData, "id") ? categoryIdSchema.safeParse(text(formData, "id")) : null;
  if (!parsed.success || (parsedId && !parsedId.success)) return { ok: false, message: "Controlla i dati inseriti." };

  const client = await verifiedStaff();
  const input = parsed.data;
  const record: CategoryInsert = {
    name: input.name,
    slug: input.slug,
    tagline: input.tagline,
    description: input.description,
    media_asset_id: input.mediaAssetId,
    publication_status: input.publicationStatus,
    published_at: input.publicationStatus === "published" ? new Date().toISOString() : null,
    active: input.active,
    seo_title: input.seoTitle,
    seo_description: input.seoDescription,
    sort_order: input.sortOrder,
  };
  if (!parsedId) {
    const result = await client.from("categories").insert(record).select("id,slug").single();
    if (result.error) return { ok: false, message: "Categoria non salvata. Verifica slug e media." };
    refreshCategories(result.data.slug);
    redirect(`/admin/categorie/${result.data.id}?created=1`);
  }
  const result = await client.from("categories").update(record).eq("id", parsedId.data);
  if (result.error) return { ok: false, message: "Categoria non salvata. Verifica slug e media." };
  refreshCategories(input.slug);
  return { ok: true, message: "Categoria salvata." };
}

export async function reorderCategoriesAction(
  _previous: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const parsed = categoryIdsSchema.safeParse(formData.getAll("categoryIds"));
  if (!parsed.success) return { ok: false, message: "Ordine categorie non valido." };
  const client = await verifiedStaff();
  const { error } = await client.rpc("reorder_categories", { p_category_ids: parsed.data });
  if (error) return { ok: false, message: "Ordine non salvato. Ricarica e riprova." };
  refreshCategories();
  return { ok: true, message: "Ordine categorie salvato." };
}

