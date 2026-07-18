"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { bundleEditorSchema, bundleIdSchema, bundleMutationCapabilities } from "@/lib/admin/bundles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type BundleActionState = { readonly ok: boolean; readonly message: string };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function nullableNumber(formData: FormData, key: string): number | null {
  const value = text(formData, key).trim();
  return value ? Number(value) : null;
}

function nullableDateTime(formData: FormData, key: string): string | null {
  const value = text(formData, key).trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toISOString();
}

function checked(formData: FormData, key: string): boolean {
  return ["on", "true", "1"].includes(text(formData, key));
}

function refreshBundles(slug?: string): void {
  revalidateTag("bundles", "max");
  revalidateTag("products", "max");
  revalidateTag("media", "max");
  revalidatePath("/admin/bundle");
  revalidatePath("/");
  if (slug) revalidatePath(`/admin/bundle/${slug}`);
}

export async function saveBundleAction(
  _previous: BundleActionState,
  formData: FormData,
): Promise<BundleActionState> {
  const productIds = formData.getAll("productIds");
  const quantities = formData.getAll("quantities");
  const parsed = bundleEditorSchema.safeParse({
    slug: text(formData, "slug"),
    eyebrow: text(formData, "eyebrow"),
    titleLineOne: text(formData, "titleLineOne"),
    titleLineTwo: text(formData, "titleLineTwo"),
    description: text(formData, "description"),
    priceCents: Number(text(formData, "priceCents")),
    compareAtPriceCents: Number(text(formData, "compareAtPriceCents")),
    heroProductId: text(formData, "heroProductId"),
    mediaAssetId: nullableNumber(formData, "mediaAssetId"),
    availabilityOverride: text(formData, "availabilityOverride") || null,
    sortOrder: Number(text(formData, "sortOrder")),
    active: checked(formData, "active"),
    startsAt: nullableDateTime(formData, "startsAt"),
    endsAt: nullableDateTime(formData, "endsAt"),
    items: productIds.map((productId, index) => ({
      productId,
      quantity: quantities[index],
      sortOrder: index,
    })),
  });
  const parsedId = text(formData, "id") ? bundleIdSchema.safeParse(text(formData, "id")) : null;
  if (!parsed.success || (parsedId && !parsedId.success)) return { ok: false, message: "Controlla contenuti, prodotti, prezzi e date." };

  const client = await createSupabaseServerClient();
  await requireUser(client);
  const principal = await requireStaffRole(client, STAFF_ROLES);
  const capabilities = bundleMutationCapabilities(principal.role);
  let commerce = {
    priceCents: parsed.data.priceCents,
    compareAtPriceCents: parsed.data.compareAtPriceCents,
    availabilityOverride: parsed.data.availabilityOverride,
  };
  if (!capabilities.editCommerce) {
    if (!parsedId) {
      commerce = { priceCents: 0, compareAtPriceCents: 1, availabilityOverride: null };
    } else {
      const existing = await client.from("bundles")
        .select("price_cents,compare_at_price_cents,availability_override")
        .eq("id", parsedId.data)
        .single();
      if (existing.error) return { ok: false, message: "Bundle non trovato." };
      commerce = {
        priceCents: existing.data.price_cents,
        compareAtPriceCents: existing.data.compare_at_price_cents,
        availabilityOverride: existing.data.availability_override,
      };
    }
  }
  const input = parsed.data;
  const { data, error } = await client.rpc("save_bundle_with_items", {
    p_bundle: {
      id: parsedId?.data ?? null,
      slug: input.slug,
      eyebrow: input.eyebrow,
      title_line_one: input.titleLineOne,
      title_line_two: input.titleLineTwo,
      description: input.description,
      price_cents: commerce.priceCents,
      compare_at_price_cents: commerce.compareAtPriceCents,
      hero_product_id: input.heroProductId,
      media_asset_id: input.mediaAssetId,
      availability_override: commerce.availabilityOverride,
      sort_order: input.sortOrder,
      active: input.active,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
    } as Json,
    p_items: input.items.map((item) => ({ product_id: item.productId, quantity: item.quantity, sort_order: item.sortOrder })) as Json,
  });
  if (error) return { ok: false, message: "Bundle non salvato. Verifica media, prodotti e valori univoci." };
  refreshBundles(input.slug);
  if (!parsedId) redirect(`/admin/bundle/${data}?created=1`);
  return { ok: true, message: "Bundle salvato in modo atomico." };
}
