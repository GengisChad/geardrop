"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import {
  metaRankingsSchema,
  metaSnapshotIdSchema,
  metaSnapshotSchema,
  metaVideosSchema,
} from "@/lib/admin/meta";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MetaActionState = { readonly ok: boolean; readonly message: string; readonly id?: number };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
function checked(formData: FormData, key: string): boolean {
  return ["on", "true", "1"].includes(text(formData, key));
}

async function verifiedStaff() {
  const client = await createSupabaseServerClient();
  await requireUser(client);
  const principal = await requireStaffRole(client, STAFF_ROLES);
  return { client, organizationId: principal.organization.id };
}

/** The public page caches on the `meta` tag; the month keeps its own path. */
function refreshMeta(month?: string): void {
  revalidateTag("meta", "max");
  revalidatePath("/meta");
  if (month) revalidatePath(`/meta/${month}`);
  revalidatePath("/sitemap.xml");
}

export async function saveMetaSnapshotAction(_state: MetaActionState, formData: FormData): Promise<MetaActionState> {
  const parsed = metaSnapshotSchema.safeParse({
    id: text(formData, "id") ? Number(text(formData, "id")) : undefined,
    month: text(formData, "month"),
    title: text(formData, "title"),
    sourceNote: text(formData, "sourceNote"),
    intro: text(formData, "intro"),
    publicationStatus: text(formData, "publicationStatus"),
    active: checked(formData, "active"),
    seoTitle: text(formData, "seoTitle"),
    seoDescription: text(formData, "seoDescription"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dati non validi" };

  const input = parsed.data;
  const { client, organizationId } = await verifiedStaff();
  const row = {
    month: input.month,
    title: input.title,
    source_note: input.sourceNote,
    intro: input.intro,
    publication_status: input.publicationStatus,
    // The table's own constraint refuses a publication date on anything not published.
    published_at: input.publicationStatus === "published" ? new Date().toISOString() : null,
    active: input.active,
    seo_title: input.seoTitle,
    seo_description: input.seoDescription,
  };

  if (input.id) {
    const result = await client.from("meta_snapshots").update(row).eq("id", input.id).eq("organization_id", organizationId);
    if (result.error) return { ok: false, message: "Non è stato possibile salvare il mese" };
    refreshMeta(input.month);
    return { ok: true, message: "Mese salvato", id: input.id };
  }

  const result = await client.from("meta_snapshots").insert({ ...row, organization_id: organizationId }).select("id").single();
  if (result.error) {
    const duplicate = result.error.code === "23505";
    return { ok: false, message: duplicate ? "Esiste già un mese con questa data" : "Non è stato possibile creare il mese" };
  }
  refreshMeta(input.month);
  return { ok: true, message: "Mese creato", id: result.data.id };
}

/**
 * Replaces one tier's rows wholesale.
 *
 * Rewriting the tier rather than diffing it keeps the rank contiguous and lets the unique
 * constraint on (snapshot, tier, rank) do its job; a diff would have to shuffle ranks
 * around a constraint that forbids the intermediate states.
 */
export async function saveMetaRankingsAction(_state: MetaActionState, formData: FormData): Promise<MetaActionState> {
  let payload: unknown;
  try {
    payload = JSON.parse(text(formData, "entries") || "[]");
  } catch {
    return { ok: false, message: "Dati della classifica illeggibili" };
  }

  const parsed = metaRankingsSchema.safeParse({
    snapshotId: text(formData, "snapshotId"),
    tierType: text(formData, "tierType"),
    entries: payload,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dati non validi" };

  const { snapshotId, tierType, entries } = parsed.data;
  const { client, organizationId } = await verifiedStaff();

  const cleared = await client.from("meta_rankings").delete().eq("snapshot_id", snapshotId).eq("tier_type", tierType);
  if (cleared.error) return { ok: false, message: "Non è stato possibile aggiornare la classifica" };

  if (entries.length > 0) {
    const rows = entries.map((entry, index) => ({
      snapshot_id: snapshotId,
      tier_type: tierType,
      rank: index + 1,
      piece_name: entry.pieceName,
      archetype: entry.archetype,
      reason: entry.reason,
      trend: entry.trend,
      product_slug: entry.productSlug,
      video_url: entry.videoUrl,
    }));
    const inserted = await client.from("meta_rankings").insert(rows);
    if (inserted.error) return { ok: false, message: "Non è stato possibile salvare le voci" };
  }

  const month = await client.from("meta_snapshots").select("month").eq("id", snapshotId).eq("organization_id", organizationId).single();
  refreshMeta(month.data?.month);
  return { ok: true, message: `Classifica salvata: ${entries.length} voci` };
}

export async function saveMetaVideosAction(_state: MetaActionState, formData: FormData): Promise<MetaActionState> {
  let payload: unknown;
  try {
    payload = JSON.parse(text(formData, "videos") || "[]");
  } catch {
    return { ok: false, message: "Dati dei video illeggibili" };
  }

  const parsed = metaVideosSchema.safeParse({ videos: payload });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dati non validi" };

  const { client, organizationId } = await verifiedStaff();
  const cleared = await client.from("meta_videos").delete().eq("organization_id", organizationId).gt("id", 0);
  if (cleared.error) return { ok: false, message: "Non è stato possibile aggiornare i video" };

  if (parsed.data.videos.length > 0) {
    const rows = parsed.data.videos.map((video, index) => ({
      organization_id: organizationId,
      youtube_url: video.youtubeUrl,
      title: video.title,
      description: video.description,
      sort_order: index,
      active: video.active,
    }));
    const inserted = await client.from("meta_videos").insert(rows);
    if (inserted.error) return { ok: false, message: "Non è stato possibile salvare i video" };
  }

  refreshMeta();
  return { ok: true, message: `Video salvati: ${parsed.data.videos.length}` };
}

export async function deleteMetaSnapshotAction(_state: MetaActionState, formData: FormData): Promise<MetaActionState> {
  const parsed = metaSnapshotIdSchema.safeParse(text(formData, "id"));
  if (!parsed.success) return { ok: false, message: "Mese non valido" };
  if (!checked(formData, "confirmed")) return { ok: false, message: "Conferma l'eliminazione" };

  const { client, organizationId } = await verifiedStaff();
  // The rankings go with it: the cascade is declared on the foreign key.
  const result = await client.from("meta_snapshots").delete().eq("id", parsed.data).eq("organization_id", organizationId);
  if (result.error) return { ok: false, message: "Non è stato possibile eliminare il mese" };
  refreshMeta();
  return { ok: true, message: "Mese eliminato" };
}
