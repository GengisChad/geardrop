"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/roles";
import {
  contentPageSchema,
  footerConfigurationSchema,
  homepageSectionIdSchema,
  homepageSectionSchema,
  navigationTreeSchema,
  type NavigationItemInput,
} from "@/lib/admin/content";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

export type ContentActionState = { readonly ok: boolean; readonly message: string; readonly id?: number };
type ContentPageInsert = Database["public"]["Tables"]["content_pages"]["Insert"];

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
function nullableText(formData: FormData, key: string): string | null { return text(formData, key).trim() || null; }
function nullableNumber(formData: FormData, key: string): number | null {
  const value = text(formData, key).trim();
  return value ? Number(value) : null;
}
function checked(formData: FormData, key: string): boolean { return ["on", "true", "1"].includes(text(formData, key)); }
function nullableDateTime(formData: FormData, key: string): string | null {
  const value = text(formData, key).trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toISOString();
}

async function verifiedStaff() {
  const client = await createSupabaseServerClient();
  await requireUser(client);
  await requireStaffRole(client, STAFF_ROLES);
  return client;
}

function refreshContent(): void {
  revalidateTag("homepage", "max");
  revalidateTag("pages", "max");
  revalidateTag("navigation", "max");
  revalidateTag("footer", "max");
  revalidatePath("/");
  revalidatePath("/admin/homepage");
  revalidatePath("/admin/pagine");
  revalidatePath("/admin/navigazione");
  revalidatePath("/admin/footer");
}

async function mediaAreReady(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  ids: readonly (number | null)[],
): Promise<boolean> {
  const requested = [...new Set(ids.filter((id): id is number => id !== null))];
  if (requested.length === 0) return true;
  const result = await client.from("media_assets").select("id").in("id", requested).eq("status", "ready");
  return !result.error && (result.data?.length ?? 0) === requested.length;
}

export async function saveHomepageSectionAction(
  _previous: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const parsed = homepageSectionSchema.safeParse({
    id: nullableNumber(formData, "id") ?? undefined,
    sectionKey: text(formData, "sectionKey"),
    sectionType: text(formData, "sectionType"),
    eyebrow: nullableText(formData, "eyebrow"),
    title: nullableText(formData, "title"),
    subtitle: nullableText(formData, "subtitle"),
    description: nullableText(formData, "description"),
    desktopMediaAssetId: nullableNumber(formData, "desktopMediaAssetId"),
    mobileMediaAssetId: nullableNumber(formData, "mobileMediaAssetId"),
    ctaLabel: nullableText(formData, "ctaLabel"),
    ctaHref: nullableText(formData, "ctaHref"),
    publicationStatus: text(formData, "publicationStatus"),
    startsAt: nullableDateTime(formData, "startsAt"),
    endsAt: nullableDateTime(formData, "endsAt"),
    active: checked(formData, "active"),
    sortOrder: Number(text(formData, "sortOrder")),
    targetIds: formData.getAll("targetIds"),
  });
  if (!parsed.success) return { ok: false, message: "Controlla tipo, contenuti, link, date e target." };
  const client = await verifiedStaff();
  const input = parsed.data;
  if (!await mediaAreReady(client, [input.desktopMediaAssetId, input.mobileMediaAssetId])) {
    return { ok: false, message: "Seleziona solo media con stato ready." };
  }
  const result = await client.rpc("save_homepage_section", {
    p_section: {
      id: input.id ?? null,
      section_key: input.sectionKey,
      section_type: input.sectionType,
      eyebrow: input.eyebrow,
      title: input.title,
      subtitle: input.subtitle,
      description: input.description,
      desktop_media_asset_id: input.desktopMediaAssetId,
      mobile_media_asset_id: input.mobileMediaAssetId,
      cta_label: input.ctaLabel,
      cta_href: input.ctaHref,
      publication_status: input.publicationStatus,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      active: input.active,
      sort_order: input.sortOrder,
    } as Json,
    p_target_ids: [...input.targetIds],
  });
  if (result.error) return { ok: false, message: "Sezione non salvata. Verifica ordine e target reali." };
  refreshContent();
  return { ok: true, message: "Sezione salvata.", id: result.data };
}

export async function publishHomepageSectionAction(formData: FormData): Promise<void> {
  const id = homepageSectionIdSchema.parse(text(formData, "id"));
  const client = await verifiedStaff();
  const { error } = await client.rpc("publish_homepage_section", { p_section_id: id });
  if (error) throw new Error("Pubblicazione sezione non completata");
  refreshContent();
}

export async function reorderHomepageSectionsAction(
  _previous: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const ids = formData.getAll("sectionIds").map((value) => homepageSectionIdSchema.safeParse(value));
  if (ids.some((id) => !id.success)) return { ok: false, message: "Ordine sezioni non valido." };
  const sectionIds = ids.map((id) => id.data as number);
  if (!sectionIds.length || new Set(sectionIds).size !== sectionIds.length) return { ok: false, message: "Ordine sezioni non valido." };
  const client = await verifiedStaff();
  const { error } = await client.rpc("reorder_homepage_sections", { p_section_ids: sectionIds });
  if (error) return { ok: false, message: "Ordine non salvato. Ricarica e riprova." };
  refreshContent();
  return { ok: true, message: "Ordine homepage salvato." };
}

export async function saveContentPageAction(
  _previous: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const parsed = contentPageSchema.safeParse({
    id: nullableNumber(formData, "id") ?? undefined,
    slug: text(formData, "slug"),
    title: text(formData, "title"),
    excerpt: nullableText(formData, "excerpt"),
    markdownSource: text(formData, "markdownSource"),
    seoTitle: nullableText(formData, "seoTitle"),
    seoDescription: nullableText(formData, "seoDescription"),
    publicationStatus: text(formData, "publicationStatus"),
    startsAt: nullableDateTime(formData, "startsAt"),
    endsAt: nullableDateTime(formData, "endsAt"),
    active: checked(formData, "active"),
    sortOrder: Number(text(formData, "sortOrder")),
  });
  if (!parsed.success) return { ok: false, message: "Controlla Markdown, SEO, stato e date." };
  const client = await verifiedStaff();
  const input = parsed.data;
  const record: ContentPageInsert = {
    slug: input.slug,
    title: input.title,
    excerpt: input.excerpt,
    markdown_source: input.markdownSource,
    format: "markdown",
    seo_title: input.seoTitle,
    seo_description: input.seoDescription,
    publication_status: input.publicationStatus,
    published_at: input.publicationStatus === "published" ? new Date().toISOString() : null,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    active: input.active,
    sort_order: input.sortOrder,
  };
  const result = input.id
    ? await client.from("content_pages").update(record).eq("id", input.id).select("id").single()
    : await client.from("content_pages").insert(record).select("id").single();
  if (result.error) return { ok: false, message: "Pagina non salvata. Verifica slug univoco." };
  refreshContent();
  return { ok: true, message: "Pagina salvata.", id: result.data.id };
}

function navigationItemPayload(item: NavigationItemInput): Json {
  return {
    label: item.label,
    href: item.href,
    active: item.active,
    children: item.children.map(navigationItemPayload),
  };
}

export async function saveNavigationTreeAction(
  _previous: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  let raw: unknown;
  try { raw = JSON.parse(text(formData, "tree")); } catch { return { ok: false, message: "Albero navigazione non valido." }; }
  const parsed = navigationTreeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Controlla struttura e link navigazione." };
  const client = await verifiedStaff();
  const input = parsed.data;
  const result = await client.rpc("save_navigation_tree", {
    p_tree: {
      menu: {
        key: input.menu.key,
        label: input.menu.label,
        publication_status: input.menu.publicationStatus,
        active: input.menu.active,
      },
      items: input.items.map(navigationItemPayload),
    },
  });
  if (result.error) return { ok: false, message: "Navigazione non salvata." };
  refreshContent();
  return { ok: true, message: "Navigazione salvata.", id: result.data };
}

export async function saveFooterConfigurationAction(
  _previous: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  let raw: unknown;
  try { raw = JSON.parse(text(formData, "configuration")); } catch { return { ok: false, message: "Configurazione footer non valida." }; }
  const parsed = footerConfigurationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Controlla colonne, link, visibilità e URL." };
  const client = await verifiedStaff();
  const result = await client.rpc("save_footer_configuration", {
    p_configuration: {
      columns: parsed.data.columns.map((column) => ({
        key: column.key,
        title: column.title,
        publication_status: column.publicationStatus,
        active: column.active,
        items: column.items.map((item) => ({ label: item.label, href: item.href, active: item.active })),
      })),
      social_links: parsed.data.socialLinks.map((link) => ({
        platform_key: link.platformKey,
        label: link.label,
        href: link.href,
        publication_status: link.publicationStatus,
        active: link.active,
      })),
    },
  });
  if (result.error) return { ok: false, message: "Footer non salvato. Ricarica e riprova." };
  refreshContent();
  return { ok: true, message: "Footer salvato." };
}
