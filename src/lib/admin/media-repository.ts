import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { MediaRepository, MediaReservation, PendingMediaAsset } from "@/lib/admin/media-service";

type Client = SupabaseClient<Database>;

export type AdminMediaStatus = "ready" | "pending" | "failed";
export type AdminMediaQuery = {
  readonly q: string;
  readonly status: AdminMediaStatus;
  readonly page: number;
  readonly pageSize: number;
};
export type AdminMediaItem = Database["public"]["Tables"]["media_assets"]["Row"] & {
  readonly previewUrl: string | null;
  readonly usageCount: number;
};
export type AdminMediaPage = {
  readonly items: readonly AdminMediaItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
};

export function normalizeAdminMediaQuery(input: Record<string, string | string[] | undefined>): AdminMediaQuery {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const rawStatus = first(input.status);
  const rawPage = Number.parseInt(first(input.page) ?? "1", 10);
  const rawPageSize = Number.parseInt(first(input.pageSize) ?? "20", 10);
  return {
    q: (first(input.q) ?? "").trim().slice(0, 100),
    status: rawStatus === "pending" || rawStatus === "failed" ? rawStatus : "ready",
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize: Number.isSafeInteger(rawPageSize) ? Math.min(50, Math.max(10, rawPageSize)) : 20,
  };
}

function escapePostgrestPattern(value: string): string {
  return value.replace(/[,%_()]/g, (character) => `\\${character}`);
}

export async function listAdminMedia(client: Client, input: AdminMediaQuery): Promise<AdminMediaPage> {
  const from = (input.page - 1) * input.pageSize;
  const to = from + input.pageSize - 1;
  let query = client.from("media_assets").select("*", { count: "exact" }).eq("status", input.status);
  if (input.q) {
    const pattern = `%${escapePostgrestPattern(input.q)}%`;
    query = query.or(`original_filename.ilike.${pattern},alt_text.ilike.${pattern},object_path.ilike.${pattern}`);
  }
  const { data, error, count } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
  if (error) throw new Error("Impossibile caricare la media library");

  const rows = data ?? [];
  const ids = rows.map((row) => row.id);
  const usage = new Map<number, number>();
  if (ids.length > 0) {
    const usageResult = await client.from("product_images").select("media_asset_id").in("media_asset_id", ids);
    if (usageResult.error) throw new Error("Impossibile caricare gli utilizzi media");
    for (const row of usageResult.data ?? []) {
      if (row.media_asset_id !== null) usage.set(row.media_asset_id, (usage.get(row.media_asset_id) ?? 0) + 1);
    }
  }

  const items = await Promise.all(rows.map(async (row): Promise<AdminMediaItem> => {
    let previewUrl: string | null = null;
    if (row.status === "ready") {
      const preview = await client.storage.from("product-images").createSignedUrl(row.object_path, 300);
      if (!preview.error) previewUrl = preview.data.signedUrl;
    }
    return { ...row, previewUrl, usageCount: usage.get(row.id) ?? 0 };
  }));
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / input.pageSize));
  return { items, total, page: Math.min(input.page, pageCount), pageSize: input.pageSize, pageCount };
}

function rowToAsset(row: Database["public"]["Tables"]["media_assets"]["Row"]): PendingMediaAsset {
  return {
    id: row.id,
    status: row.status,
    objectPath: row.object_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type as PendingMediaAsset["mimeType"],
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    altText: row.alt_text,
    uploadedBy: row.uploaded_by,
  };
}

export function createMediaRepository(client: Client): MediaRepository {
  return {
    async reserve(input: MediaReservation) {
      const { data, error } = await client.from("media_assets").insert({
        bucket_id: "product-images",
        object_path: input.objectPath,
        original_filename: input.originalFilename,
        mime_type: input.mimeType,
        byte_size: input.byteSize,
        width: input.width,
        height: input.height,
        alt_text: input.altText,
        uploaded_by: input.uploadedBy,
        status: "pending",
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    async get(id) {
      const { data, error } = await client.from("media_assets").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? rowToAsset(data) : null;
    },
    async finalize(id, metadata) {
      const { error } = await client.rpc("finalize_media_upload", {
        p_media_asset_id: id,
        p_mime_type: metadata.mimeType,
        p_byte_size: metadata.byteSize,
        p_width: metadata.width,
        p_height: metadata.height,
      });
      if (error) throw error;
    },
    async fail(id, failureCode) {
      const { error } = await client.rpc("fail_media_upload", {
        p_media_asset_id: id,
        p_failure_code: failureCode,
      });
      if (error) throw error;
    },
    async swapAssociations(oldId, newId) {
      const { data, error } = await client.rpc("swap_media_asset_associations", {
        p_old_media_asset_id: oldId,
        p_new_media_asset_id: newId,
      });
      if (error || !data || typeof data !== "object" || Array.isArray(data)) throw error ?? new Error("Invalid swap result");
      const value = data as Record<string, unknown>;
      if (typeof value.updated_count !== "number" || typeof value.old_asset_unused !== "boolean") {
        throw new Error("Invalid swap result");
      }
      return { updatedCount: value.updated_count, oldAssetUnused: value.old_asset_unused };
    },
    async beginDelete(id) {
      const { data, error } = await client.rpc("begin_media_delete", { p_media_asset_id: id });
      if (error) throw error;
      return data;
    },
    async completeDelete(id) {
      const { error } = await client.rpc("complete_media_delete", { p_media_asset_id: id });
      if (error) throw error;
    },
  };
}
