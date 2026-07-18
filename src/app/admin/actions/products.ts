"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { STAFF_ROLES, type StaffPrincipal, type StaffRole } from "@/lib/auth/roles";
import {
  productEditorSchema,
  productIdSchema,
  productIdsSchema,
  productMutationCapabilities,
  promoTagSchema,
  relationTypeSchema,
} from "@/lib/admin/products";
import { associateMediaSchema } from "@/lib/admin/media";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

export type ProductActionState = { readonly ok: boolean; readonly message: string };
type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

const duplicateActionSchema = z.object({ id: productIdSchema });
const deleteActionSchema = z.object({
  id: productIdSchema,
  expectedName: z.string().min(1).max(160),
  confirmPermanent: z.literal("on"),
});
const bulkActionSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.enum(["publish", "draft", "archive"]), productIds: productIdsSchema }),
  z.object({ operation: z.literal("category"), productIds: productIdsSchema, categoryId: productIdSchema }),
  z.object({ operation: z.literal("tag"), productIds: productIdsSchema, tag: promoTagSchema }),
]);
const relationBaseSchema = z.object({
  productId: productIdSchema,
  relatedProductId: productIdSchema,
  relationType: relationTypeSchema,
  sortOrder: z.coerce.number().int().min(0).max(100_000),
});
const relationCreateSchema = relationBaseSchema.refine((value) => value.productId !== value.relatedProductId, {
  path: ["relatedProductId"],
  message: "Il prodotto correlato deve essere diverso",
});
const relationRemoveSchema = relationBaseSchema.omit({ sortOrder: true });
const tagActionSchema = z.object({ productId: productIdSchema, tag: promoTagSchema });
const detailCreateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("spec"), productId: productIdSchema,
    label: z.string().trim().min(1).max(160), value: z.string().trim().min(1).max(500),
    sortOrder: z.coerce.number().int().min(0).max(100_000),
  }),
  z.object({
    kind: z.literal("feature"), productId: productIdSchema,
    title: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(2_000),
    sortOrder: z.coerce.number().int().min(0).max(100_000),
  }),
  z.object({
    kind: z.literal("box"), productId: productIdSchema,
    content: z.string().trim().min(1).max(500),
    sortOrder: z.coerce.number().int().min(0).max(100_000),
  }),
]);
const detailRemoveSchema = z.object({
  productId: productIdSchema,
  detailId: productIdSchema,
  kind: z.enum(["spec", "feature", "box"]),
});
const imageUpdateSchema = z.object({
  productId: productIdSchema,
  imageId: productIdSchema,
  alt: z.string().trim().min(1).max(500),
  published: z.boolean(),
  isPrimary: z.boolean(),
});
const imageLinkSchema = z.object({ productId: productIdSchema, imageId: productIdSchema });
const imageOrderSchema = z.object({ productId: productIdSchema, imageIds: productIdsSchema });
const detailsReplacementSchema = z.object({
  productId: productIdSchema,
  specs: z.array(z.object({ label: z.string().trim().min(1), value: z.string().trim().min(1) })).max(100),
  features: z.array(z.object({ title: z.string().trim().min(1), description: z.string().trim().min(1) })).max(100),
  boxContents: z.array(z.object({ content: z.string().trim().min(1) })).max(100),
});

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function nullableText(formData: FormData, key: string): string | null {
  const value = text(formData, key).trim();
  return value || null;
}

function checked(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function nullableNumber(formData: FormData, key: string): number | null {
  const value = text(formData, key).trim();
  return value ? Number(value) : null;
}

async function verifiedStaff(
  client: Client,
  allowed: readonly StaffRole[] = STAFF_ROLES,
): Promise<StaffPrincipal> {
  await requireUser(client);
  return requireStaffRole(client, allowed);
}

function productInput(formData: FormData) {
  return productEditorSchema.safeParse({
    name: text(formData, "name"),
    shortName: nullableText(formData, "shortName"),
    slug: text(formData, "slug"),
    sku: text(formData, "sku"),
    categoryId: text(formData, "categoryId"),
    tagline: text(formData, "tagline"),
    description: text(formData, "description"),
    priceCents: Number(text(formData, "priceCents")),
    compareAtPriceCents: nullableNumber(formData, "compareAtPriceCents"),
    publicationStatus: text(formData, "publicationStatus"),
    active: checked(formData, "active"),
    bladeType: nullableText(formData, "bladeType"),
    manageStock: checked(formData, "manageStock"),
    lowStockThreshold: Number(text(formData, "lowStockThreshold")),
    allowBackorder: checked(formData, "allowBackorder"),
    availabilityOverride: nullableText(formData, "availabilityOverride"),
    preorderAllocation: Number(text(formData, "preorderAllocation")),
    preorderReleaseDate: nullableText(formData, "preorderReleaseDate"),
    preorderWarningConfirmed: checked(formData, "preorderWarningConfirmed"),
    seoTitle: nullableText(formData, "seoTitle"),
    seoDescription: nullableText(formData, "seoDescription"),
    sortOrder: Number(text(formData, "sortOrder")),
  });
}

function contentFields(input: z.infer<typeof productEditorSchema>): ProductUpdate {
  return {
    name: input.name,
    short_name: input.shortName,
    slug: input.slug,
    sku: input.sku,
    category_id: input.categoryId,
    tagline: input.tagline,
    description: input.description,
    blade_type: input.bladeType,
    seo_title: input.seoTitle,
    seo_description: input.seoDescription,
    sort_order: input.sortOrder,
  };
}

function commerceFields(input: z.infer<typeof productEditorSchema>): ProductUpdate {
  return {
    price_cents: input.priceCents,
    compare_at_price_cents: input.compareAtPriceCents,
    manage_stock: input.manageStock,
    low_stock_threshold: input.lowStockThreshold,
    allow_backorder: input.allowBackorder,
    availability_override: input.availabilityOverride,
    preorder_allocation: input.preorderAllocation,
    preorder_release_date: input.preorderReleaseDate,
  };
}

type PublicationFields = {
  readonly publication_status: "draft" | "published" | "archived";
  readonly active: boolean;
};

function publicationFields(formData: FormData, input: z.infer<typeof productEditorSchema>): PublicationFields {
  const intent = text(formData, "intent");
  if (intent === "publish") return { publication_status: "published", active: true };
  if (intent === "archive") return { publication_status: "archived", active: false };
  if (intent === "draft") return { publication_status: "draft", active: false };
  return { publication_status: input.publicationStatus, active: input.active };
}

function refreshProductCache(slug?: string): void {
  revalidateTag("products", "max");
  revalidateTag("categories", "max");
  revalidateTag("inventory", "max");
  revalidateTag("media", "max");
  if (slug) revalidateTag(`product:${slug}`, "max");
  revalidatePath("/admin/prodotti");
  revalidatePath("/catalogo");
  if (slug) revalidatePath(`/prodotto/${slug}`);
}

function safeFailure(error: unknown): ProductActionState {
  if (error instanceof z.ZodError) return { ok: false, message: "Controlla i dati inseriti." };
  return { ok: false, message: "Operazione non completata. Riprova o verifica i dati." };
}

export async function saveProductAction(
  _previous: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const parsed = productInput(formData);
  const idValue = nullableNumber(formData, "id");
  if (!parsed.success) return safeFailure(parsed.error);
  let productId: number | null = null;
  if (idValue !== null) {
    const parsedId = productIdSchema.safeParse(idValue);
    if (!parsedId.success) return safeFailure(parsedId.error);
    productId = parsedId.data;
  }

  const client = await createSupabaseServerClient();
  const principal = await verifiedStaff(client);
  const capabilities = productMutationCapabilities(principal.role);
  const content = contentFields(parsed.data);
  const requestedPublication = publicationFields(formData, parsed.data);

  if (productId === null) {
    const publication = capabilities.editCommerce
      ? requestedPublication
      : { publication_status: "draft" as const, active: false };
    const insert: ProductInsert = {
      category_id: parsed.data.categoryId,
      slug: parsed.data.slug,
      sku: parsed.data.sku,
      name: parsed.data.name,
      tagline: parsed.data.tagline,
      description: parsed.data.description,
      blade_type: parsed.data.bladeType,
      short_name: parsed.data.shortName,
      seo_title: parsed.data.seoTitle,
      seo_description: parsed.data.seoDescription,
      sort_order: parsed.data.sortOrder,
      price_cents: capabilities.editCommerce ? parsed.data.priceCents : 0,
      compare_at_price_cents: capabilities.editCommerce ? parsed.data.compareAtPriceCents : null,
      manage_stock: capabilities.editCommerce ? parsed.data.manageStock : true,
      low_stock_threshold: capabilities.editCommerce ? parsed.data.lowStockThreshold : 5,
      allow_backorder: capabilities.editCommerce ? parsed.data.allowBackorder : false,
      availability_override: capabilities.editCommerce ? parsed.data.availabilityOverride : null,
      preorder_allocation: capabilities.editCommerce ? parsed.data.preorderAllocation : 0,
      preorder_release_date: capabilities.editCommerce ? parsed.data.preorderReleaseDate : null,
      publication_status: publication.publication_status,
      active: publication.active,
    };
    const { data, error } = await client.from("products").insert(insert).select("id,slug").single();
    if (error) return safeFailure(error);
    refreshProductCache(data.slug);
    redirect(`/admin/prodotti/${data.id}?created=1`);
  }

  const update: ProductUpdate = {
    ...content,
    ...requestedPublication,
    ...(capabilities.editCommerce ? commerceFields(parsed.data) : {}),
  };
  const { error } = await client.from("products").update(update).eq("id", productId);
  if (error) return safeFailure(error);
  refreshProductCache(parsed.data.slug);
  return { ok: true, message: "Prodotto salvato." };
}

export async function duplicateProductAction(formData: FormData): Promise<void> {
  const input = duplicateActionSchema.parse({ id: text(formData, "id") });
  const client = await createSupabaseServerClient();
  await verifiedStaff(client);
  const { data: source, error: sourceError } = await client
    .from("products").select("name,slug,sku").eq("id", input.id).single();
  if (sourceError) redirect("/admin/prodotti?error=duplicate");

  const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
  const name = `${source.name} (copia)`;
  const slug = `${source.slug}-copia-${suffix}`;
  const sku = `${source.sku}-copy-${suffix}`;
  const { data, error } = await client.rpc("duplicate_product_draft", {
    p_source_product_id: input.id,
    p_name: name,
    p_slug: slug,
    p_sku: sku,
  });
  if (error) redirect("/admin/prodotti?error=duplicate");
  refreshProductCache(slug);
  redirect(`/admin/prodotti/${data}?duplicated=1`);
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const input = deleteActionSchema.parse({
    id: text(formData, "id"),
    expectedName: text(formData, "confirmation"),
    confirmPermanent: text(formData, "confirmPermanent"),
  });
  const client = await createSupabaseServerClient();
  await verifiedStaff(client, ["owner", "admin"]);
  const { data: product, error: readError } = await client
    .from("products").select("slug").eq("id", input.id).single();
  if (readError) redirect(`/admin/prodotti/${input.id}?error=delete`);
  const { error } = await client.rpc("delete_product_permanently", {
    p_product_id: input.id,
    p_expected_name: input.expectedName,
  });
  if (error) redirect(`/admin/prodotti/${input.id}?error=delete`);
  refreshProductCache(product.slug);
  redirect("/admin/prodotti?deleted=1");
}

export async function bulkProductAction(
  _previous: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const raw = {
    operation: text(formData, "operation"),
    productIds: formData.getAll("productIds"),
    categoryId: text(formData, "categoryId"),
    tag: text(formData, "tag"),
  };
  const parsed = bulkActionSchema.safeParse(raw);
  if (!parsed.success) return safeFailure(parsed.error);

  const client = await createSupabaseServerClient();
  await verifiedStaff(client);
  const input = parsed.data;
  if (input.operation === "tag") {
    const { error } = await client.from("product_tags").upsert(
      input.productIds.map((productId) => ({ product_id: productId, tag: input.tag })),
      { onConflict: "product_id,tag" },
    );
    if (error) return safeFailure(error);
  } else {
    const { error } = await client.rpc("bulk_update_products", {
      p_product_ids: input.productIds,
      p_operation: input.operation,
      ...(input.operation === "category" ? { p_category_id: input.categoryId } : {}),
    });
    if (error) return safeFailure(error);
  }
  refreshProductCache();
  return { ok: true, message: `${input.productIds.length} prodotti aggiornati.` };
}

export async function addProductRelationAction(formData: FormData): Promise<void> {
  const input = relationCreateSchema.parse({
    productId: text(formData, "productId"), relatedProductId: text(formData, "relatedProductId"),
    relationType: text(formData, "relationType"), sortOrder: text(formData, "sortOrder"),
  });
  const client = await createSupabaseServerClient();
  await verifiedStaff(client);
  const { error } = await client.from("product_relations").upsert({
    product_id: input.productId, related_product_id: input.relatedProductId,
    relation_type: input.relationType, sort_order: input.sortOrder,
  });
  if (error) redirect(`/admin/prodotti/${input.productId}?error=relation`);
  refreshProductCache();
  redirect(`/admin/prodotti/${input.productId}#correlati`);
}

export async function removeProductRelationAction(formData: FormData): Promise<void> {
  const input = relationRemoveSchema.parse({
    productId: text(formData, "productId"), relatedProductId: text(formData, "relatedProductId"),
    relationType: text(formData, "relationType"),
  });
  const client = await createSupabaseServerClient();
  await verifiedStaff(client);
  const { error } = await client.from("product_relations").delete()
    .eq("product_id", input.productId).eq("related_product_id", input.relatedProductId)
    .eq("relation_type", input.relationType);
  if (error) redirect(`/admin/prodotti/${input.productId}?error=relation`);
  refreshProductCache();
  redirect(`/admin/prodotti/${input.productId}#correlati`);
}

export async function addProductTagAction(formData: FormData): Promise<void> {
  const input = tagActionSchema.parse({ productId: text(formData, "productId"), tag: text(formData, "tag") });
  const client = await createSupabaseServerClient();
  await verifiedStaff(client);
  const { error } = await client.from("product_tags").upsert({ product_id: input.productId, tag: input.tag });
  if (error) redirect(`/admin/prodotti/${input.productId}?error=tag`);
  refreshProductCache();
  redirect(`/admin/prodotti/${input.productId}#merchandising`);
}

export async function removeProductTagAction(formData: FormData): Promise<void> {
  const input = tagActionSchema.parse({ productId: text(formData, "productId"), tag: text(formData, "tag") });
  const client = await createSupabaseServerClient();
  await verifiedStaff(client);
  const { error } = await client.from("product_tags").delete()
    .eq("product_id", input.productId).eq("tag", input.tag);
  if (error) redirect(`/admin/prodotti/${input.productId}?error=tag`);
  refreshProductCache();
  redirect(`/admin/prodotti/${input.productId}#merchandising`);
}

export async function addProductDetailAction(formData: FormData): Promise<void> {
  const input = detailCreateSchema.parse({
    kind: text(formData, "kind"), productId: text(formData, "productId"),
    label: text(formData, "label"), value: text(formData, "value"),
    title: text(formData, "title"), description: text(formData, "detailDescription"),
    content: text(formData, "content"), sortOrder: text(formData, "sortOrder"),
  });
  const client = await createSupabaseServerClient();
  await verifiedStaff(client);
  const result = input.kind === "spec"
    ? await client.from("product_specs").insert({ product_id: input.productId, label: input.label, value: input.value, sort_order: input.sortOrder })
    : input.kind === "feature"
      ? await client.from("product_features").insert({ product_id: input.productId, title: input.title, description: input.description, sort_order: input.sortOrder })
      : await client.from("product_box_contents").insert({ product_id: input.productId, content: input.content, sort_order: input.sortOrder });
  if (result.error) redirect(`/admin/prodotti/${input.productId}?error=detail`);
  refreshProductCache();
  redirect(`/admin/prodotti/${input.productId}#dettagli`);
}

export async function removeProductDetailAction(formData: FormData): Promise<void> {
  const input = detailRemoveSchema.parse({
    productId: text(formData, "productId"), detailId: text(formData, "detailId"), kind: text(formData, "kind"),
  });
  const client = await createSupabaseServerClient();
  await verifiedStaff(client);
  const result = input.kind === "spec"
    ? await client.from("product_specs").delete().eq("id", input.detailId).eq("product_id", input.productId)
    : input.kind === "feature"
      ? await client.from("product_features").delete().eq("id", input.detailId).eq("product_id", input.productId)
      : await client.from("product_box_contents").delete().eq("id", input.detailId).eq("product_id", input.productId);
  if (result.error) redirect(`/admin/prodotti/${input.productId}?error=detail`);
  refreshProductCache();
  redirect(`/admin/prodotti/${input.productId}#dettagli`);
}

export async function replaceProductDetailsAction(formData: FormData): Promise<void> {
  const input = detailsReplacementSchema.parse({
    productId: text(formData, "productId"),
    specs: JSON.parse(text(formData, "specs")) as unknown,
    features: JSON.parse(text(formData, "features")) as unknown,
    boxContents: JSON.parse(text(formData, "boxContents")) as unknown,
  });
  const client = await createSupabaseServerClient();
  await verifiedStaff(client);
  const { error } = await client.rpc("replace_product_details", {
    p_product_id: input.productId,
    p_specs: input.specs as Json,
    p_features: input.features as Json,
    p_box_contents: input.boxContents as Json,
  });
  if (error) redirect(`/admin/prodotti/${input.productId}?error=details`);
  refreshProductCache();
  redirect(`/admin/prodotti/${input.productId}#dettagli`);
}

export async function updateProductImageAction(formData: FormData): Promise<void> {
  const input = imageUpdateSchema.parse({
    productId: text(formData, "productId"), imageId: text(formData, "imageId"),
    alt: text(formData, "alt"), published: checked(formData, "published"),
    isPrimary: checked(formData, "isPrimary"),
  });
  const client = await createSupabaseServerClient();
  await verifiedStaff(client);
  const { error } = await client.from("product_images").update({
    alt: input.alt, published: input.published,
  }).eq("id", input.imageId).eq("product_id", input.productId);
  if (error) redirect(`/admin/prodotti/${input.productId}?error=image`);
  if (input.isPrimary) {
    const { error: primaryError } = await client.rpc("set_primary_product_image", {
      p_product_id: input.productId, p_image_id: input.imageId,
    });
    if (primaryError) redirect(`/admin/prodotti/${input.productId}?error=image`);
  }
  refreshProductCache();
  redirect(`/admin/prodotti/${input.productId}#immagini`);
}

export async function reorderProductImagesAction(formData: FormData): Promise<void> {
  const input = imageOrderSchema.parse({
    productId: text(formData, "productId"), imageIds: formData.getAll("imageIds"),
  });
  const client = await createSupabaseServerClient();
  await verifiedStaff(client);
  const { error } = await client.rpc("reorder_product_images", {
    p_product_id: input.productId, p_image_ids: input.imageIds,
  });
  if (error) redirect(`/admin/prodotti/${input.productId}?error=image-order`);
  refreshProductCache();
  redirect(`/admin/prodotti/${input.productId}#immagini`);
}

export async function associateProductMediaAction(formData: FormData): Promise<void> {
  const input = associateMediaSchema.parse({
    productId: formData.get("productId"), mediaAssetId: formData.get("mediaAssetId"),
  });
  const client = await createSupabaseServerClient();
  await verifiedStaff(client);
  const [media, lastImage] = await Promise.all([
    client.from("media_assets").select("id,object_path,width,height,alt_text,status").eq("id", input.mediaAssetId).single(),
    client.from("product_images").select("sort_order").eq("product_id", input.productId).order("sort_order", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (media.error || lastImage.error || media.data.status !== "ready") {
    redirect(`/admin/prodotti/${input.productId}?error=media-association`);
  }
  const { data: image, error } = await client.from("product_images").insert({
    product_id: input.productId,
    media_asset_id: media.data.id,
    src: media.data.object_path,
    width: media.data.width,
    height: media.data.height,
    alt: media.data.alt_text,
    sort_order: (lastImage.data?.sort_order ?? -1) + 1,
    published: false,
    is_primary: lastImage.data === null,
  }).select("id").single();
  if (error) redirect(`/admin/prodotti/${input.productId}?error=media-association`);
  if (lastImage.data === null) {
    const { error: primaryError } = await client.rpc("set_primary_product_image", {
      p_product_id: input.productId, p_image_id: image.id,
    });
    if (primaryError) redirect(`/admin/prodotti/${input.productId}?error=media-association`);
  }
  refreshProductCache();
  redirect(`/admin/prodotti/${input.productId}#immagini`);
}

export async function removeProductImageLinkAction(formData: FormData): Promise<void> {
  const input = imageLinkSchema.parse({ productId: text(formData, "productId"), imageId: text(formData, "imageId") });
  const client = await createSupabaseServerClient();
  await verifiedStaff(client);
  const { error } = await client.from("product_images").delete()
    .eq("id", input.imageId).eq("product_id", input.productId);
  if (error) redirect(`/admin/prodotti/${input.productId}?error=image`);
  refreshProductCache();
  redirect(`/admin/prodotti/${input.productId}#immagini`);
}
