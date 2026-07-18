import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { MediaRepository, MediaReservation, PendingMediaAsset } from "@/lib/admin/media-service";

type Client = SupabaseClient<Database>;

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
