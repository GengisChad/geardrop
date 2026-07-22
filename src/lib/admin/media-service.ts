import sharp from "sharp";
import type { StaffRole } from "@/lib/auth/roles";
import type { AdminActionResult } from "@/lib/admin/action-state";
import {
  beginMediaUploadSchema,
  deleteMediaSchema,
  finalizeMediaUploadSchema,
  replaceMediaSchema,
} from "@/lib/admin/media";

export type MediaUploadTicket = {
  readonly mediaAssetId: number;
  readonly objectPath: string;
  readonly token: string;
};

export type PendingMediaAsset = {
  readonly id: number;
  readonly status: "pending" | "ready" | "failed";
  readonly objectPath: string;
  readonly originalFilename: string;
  readonly mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/avif";
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly altText: string;
  readonly uploadedBy: string;
};

export type ReadyMediaAsset = Omit<PendingMediaAsset, "status"> & {
  readonly status: "ready";
};

export type MediaReservation = Omit<PendingMediaAsset, "id" | "status">;

export type MediaRepository = {
  reserve(input: MediaReservation): Promise<number>;
  get(id: number): Promise<PendingMediaAsset | null>;
  finalize(id: number, metadata: { readonly mimeType: string; readonly byteSize: number; readonly width: number; readonly height: number }): Promise<void>;
  fail(id: number, failureCode: string): Promise<void>;
  swapAssociations(oldId: number, newId: number): Promise<{ readonly updatedCount: number; readonly oldAssetUnused: boolean }>;
  beginDelete(id: number): Promise<string>;
  completeDelete(id: number): Promise<void>;
};

export type MediaStorage = {
  createSignedUploadUrl(path: string, options: { readonly upsert: false }): Promise<{ readonly token: string }>;
  download(path: string): Promise<Blob>;
  remove(path: string): Promise<void>;
};

export type ImageMetadata = {
  readonly format: string | undefined;
  readonly width: number | undefined;
  readonly height: number | undefined;
};

export type MediaServiceDependencies = {
  principal: { readonly userId: string; readonly role: StaffRole };
  repository: MediaRepository;
  storage: MediaStorage;
  now(): Date;
  randomUUID(): string;
  inspectImage(buffer: Buffer): Promise<ImageMetadata>;
};

const mimeExtensions = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
} as const;

const formatMimes: Readonly<Record<string, PendingMediaAsset["mimeType"]>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};

function failure<T>(code: string, message: string): AdminActionResult<T> {
  return { ok: false, code, message };
}

export async function inspectImageWithSharp(buffer: Buffer): Promise<ImageMetadata> {
  const metadata = await sharp(buffer, { failOn: "error" }).metadata();
  return { format: metadata.format, width: metadata.width, height: metadata.height };
}

export async function beginMediaUpload(
  rawInput: unknown,
  deps: MediaServiceDependencies,
): Promise<AdminActionResult<MediaUploadTicket>> {
  const parsed = beginMediaUploadSchema.safeParse(rawInput);
  if (!parsed.success) return failure("invalid_media", "Controlla file, formato e testo alternativo.");
  const input = parsed.data;
  const { principal } = deps;
  const extension = mimeExtensions[input.mimeType];
  const objectPath = `${principal.userId}/${deps.now().toISOString().slice(0, 10)}/${deps.randomUUID()}.${extension}`;
  const originalFilename = input.originalFilename.split(/[\\/]/).at(-1) ?? input.originalFilename;
  let mediaAssetId: number | null = null;

  try {
    mediaAssetId = await deps.repository.reserve({
      objectPath,
      originalFilename,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      width: input.width,
      height: input.height,
      altText: input.altText,
      uploadedBy: principal.userId,
    });
    const signed = await deps.storage.createSignedUploadUrl(objectPath, { upsert: false });
    return {
      ok: true,
      message: "Upload autorizzato.",
      data: { mediaAssetId, objectPath, token: signed.token },
    };
  } catch {
    if (mediaAssetId !== null) {
      try { await deps.repository.fail(mediaAssetId, "signed_url_failed"); } catch { /* best effort state closure */ }
    }
    return failure("upload_authorization_failed", "Impossibile autorizzare il caricamento.");
  }
}

async function compensateFailedUpload(
  asset: PendingMediaAsset,
  failureCode: string,
  deps: MediaServiceDependencies,
): Promise<void> {
  try { await deps.storage.remove(asset.objectPath); } catch { /* lifecycle remains non-public */ }
  try { await deps.repository.fail(asset.id, failureCode); } catch { /* original failure remains authoritative */ }
}

export async function finalizeMediaUpload(
  rawInput: unknown,
  deps: MediaServiceDependencies,
): Promise<AdminActionResult<ReadyMediaAsset>> {
  const parsed = finalizeMediaUploadSchema.safeParse(rawInput);
  if (!parsed.success) return failure("invalid_media", "Metadati media non validi.");
  const input = parsed.data;
  const asset = await deps.repository.get(input.mediaAssetId);
  if (!asset || asset.status !== "pending" || asset.uploadedBy !== deps.principal.userId) {
    return failure("media_not_pending", "Upload non disponibile per la finalizzazione.");
  }

  try {
    const blob = await deps.storage.download(asset.objectPath);
    if (blob.size !== asset.byteSize || blob.size !== input.byteSize || blob.type !== asset.mimeType || blob.type !== input.mimeType) {
      throw new Error("declared bytes mismatch");
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    const metadata = await deps.inspectImage(buffer);
    const decodedMime = metadata.format ? formatMimes[metadata.format] : undefined;
    if (!decodedMime
      || decodedMime !== asset.mimeType
      || metadata.width !== asset.width
      || metadata.height !== asset.height
      || metadata.width !== input.width
      || metadata.height !== input.height) {
      throw new Error("decoded metadata mismatch");
    }

    await deps.repository.finalize(asset.id, {
      mimeType: decodedMime,
      byteSize: blob.size,
      width: metadata.width,
      height: metadata.height,
    });
    return { ok: true, message: "Media pronto.", data: { ...asset, status: "ready" } };
  } catch {
    await compensateFailedUpload(asset, "finalization_failed", deps);
    return failure("media_finalization_failed", "Il file non supera la verifica server.");
  }
}

export async function replaceMediaAsset(
  rawInput: unknown,
  deps: MediaServiceDependencies,
): Promise<AdminActionResult<ReadyMediaAsset>> {
  const parsed = replaceMediaSchema.safeParse(rawInput);
  if (!parsed.success) return failure("invalid_replacement", "Sostituzione media non valida.");
  const ticket = await beginMediaUpload(parsed.data.file, deps);
  if (!ticket.ok) return ticket;
  const ready = await finalizeMediaUpload({ mediaAssetId: ticket.data.mediaAssetId, ...parsed.data.file }, deps);
  if (!ready.ok) return ready;

  try {
    const swap = await deps.repository.swapAssociations(parsed.data.oldMediaAssetId, ready.data.id);
    if (swap.oldAssetUnused && (deps.principal.role === "owner" || deps.principal.role === "admin")) {
      await deleteMediaAsset({ mediaAssetId: parsed.data.oldMediaAssetId }, deps);
    }
    return ready;
  } catch {
    await deleteMediaAsset({ mediaAssetId: ready.data.id }, deps);
    return failure("media_replacement_failed", "Associazioni non modificate; riprova la sostituzione.");
  }
}

export async function deleteMediaAsset(
  rawInput: unknown,
  deps: MediaServiceDependencies,
): Promise<AdminActionResult<undefined>> {
  const parsed = deleteMediaSchema.safeParse(rawInput);
  if (!parsed.success) return failure("invalid_media", "Media non valido.");
  if (deps.principal.role !== "owner" && deps.principal.role !== "admin") {
    return failure("forbidden", "Solo owner e admin possono eliminare media.");
  }

  try {
    const path = await deps.repository.beginDelete(parsed.data.mediaAssetId);
    await deps.storage.remove(path);
    await deps.repository.completeDelete(parsed.data.mediaAssetId);
    return { ok: true, message: "Media eliminato.", data: undefined };
  } catch {
    return failure("media_delete_failed", "Media non eliminato; verifica associazioni e Storage.");
  }
}

export async function processMediaBatch<TInput, TResult>(
  files: readonly TInput[],
  worker: (file: TInput) => Promise<AdminActionResult<TResult>>,
  concurrency: number,
): Promise<readonly AdminActionResult<TResult>[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 20) {
    throw new Error("Invalid media batch concurrency");
  }
  const results = new Array<AdminActionResult<TResult>>(files.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < files.length) {
      const index = cursor++;
      try {
        results[index] = await worker(files[index] as TInput);
      } catch {
        results[index] = failure("batch_item_failed", "File non elaborato.");
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, run));
  return results;
}
