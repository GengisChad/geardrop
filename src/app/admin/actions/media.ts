"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import type { StaffRole } from "@/lib/auth/roles";
import {
  beginMediaUploadSchema,
  deleteMediaSchema,
  finalizeMediaUploadSchema,
  replaceMediaSchema,
} from "@/lib/admin/media";
import { createMediaRepository } from "@/lib/admin/media-repository";
import {
  beginMediaUpload,
  deleteMediaAsset,
  finalizeMediaUpload,
  inspectImageWithSharp,
  replaceMediaAsset,
  type MediaServiceDependencies,
} from "@/lib/admin/media-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function dependencies(allowed: readonly StaffRole[]): Promise<MediaServiceDependencies> {
  const client = await createSupabaseServerClient();
  await requireUser(client);
  const principal = await requireStaffRole(client, allowed);
  return {
    principal: { userId: principal.userId, role: principal.role },
    repository: createMediaRepository(client),
    storage: {
      async createSignedUploadUrl(path, options) {
        const { data, error } = await client.storage.from("product-images").createSignedUploadUrl(path, options);
        if (error) throw error;
        return { token: data.token };
      },
      async download(path) {
        const { data, error } = await client.storage.from("product-images").download(path);
        if (error) throw error;
        return data;
      },
      async remove(path) {
        const { error } = await client.storage.from("product-images").remove([path]);
        if (error) throw error;
      },
    },
    now: () => new Date(),
    randomUUID,
    inspectImage: inspectImageWithSharp,
  };
}

function refreshMedia(): void {
  revalidateTag("media", "max");
  revalidateTag("products", "max");
  revalidatePath("/admin/media");
  revalidatePath("/admin/prodotti");
}

export async function beginMediaUploadAction(input: unknown) {
  const parsed = beginMediaUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "invalid_media", message: "Controlla i dati del file." };
  return beginMediaUpload(parsed.data, await dependencies(["owner", "admin", "editor"]));
}

export async function finalizeMediaUploadAction(input: unknown) {
  const parsed = finalizeMediaUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "invalid_media", message: "Metadati non validi." };
  const result = await finalizeMediaUpload(parsed.data, await dependencies(["owner", "admin", "editor"]));
  if (result.ok) refreshMedia();
  return result;
}

export async function replaceMediaAssetAction(input: unknown) {
  const parsed = replaceMediaSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "invalid_replacement", message: "Sostituzione non valida." };
  const result = await replaceMediaAsset(parsed.data, await dependencies(["owner", "admin", "editor"]));
  if (result.ok) refreshMedia();
  return result;
}

export async function deleteMediaAssetAction(input: unknown) {
  const parsed = deleteMediaSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "invalid_media", message: "Media non valido." };
  const result = await deleteMediaAsset(parsed.data, await dependencies(["owner", "admin"]));
  if (result.ok) refreshMedia();
  return result;
}
