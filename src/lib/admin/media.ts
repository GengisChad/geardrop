import { z } from "zod";

export const MEDIA_BATCH_DEFAULT = 8;
export const MEDIA_BATCH_HARD_MAX = 20;
export const MEDIA_FILE_MAX_BYTES = 10_485_760;

const mediaMimeTypeSchema = z.enum(["image/png", "image/jpeg", "image/webp", "image/avif"]);
const mediaDimensionSchema = z.coerce.number().int().min(1).max(20_000);
const mediaAssetIdSchema = z.coerce.number().int().positive();

export const beginMediaUploadSchema = z.object({
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: mediaMimeTypeSchema,
  byteSize: z.coerce.number().int().min(1).max(MEDIA_FILE_MAX_BYTES),
  width: mediaDimensionSchema,
  height: mediaDimensionSchema,
  altText: z.string().trim().min(1).max(500),
}).superRefine((value, context) => {
  const filename = value.originalFilename.toLowerCase();
  const allowedExtension = /\.(png|jpe?g|webp|avif)$/.test(filename);
  if (!allowedExtension || filename.endsWith(".svg")) {
    context.addIssue({
      code: "custom",
      path: ["originalFilename"],
      message: "Formato file non supportato",
    });
  }
});

export const finalizeMediaUploadSchema = z.object({
  mediaAssetId: mediaAssetIdSchema,
  mimeType: mediaMimeTypeSchema,
  byteSize: z.coerce.number().int().min(1).max(MEDIA_FILE_MAX_BYTES),
  width: mediaDimensionSchema,
  height: mediaDimensionSchema,
});

export const replaceMediaSchema = z.object({
  oldMediaAssetId: mediaAssetIdSchema,
  file: beginMediaUploadSchema,
});

export const associateMediaSchema = z.object({
  productId: z.coerce.number().int().positive(),
  mediaAssetId: mediaAssetIdSchema,
});

export const mediaBatchSchema = z.array(beginMediaUploadSchema).min(1).max(MEDIA_BATCH_HARD_MAX);
export const deleteMediaSchema = z.object({ mediaAssetId: mediaAssetIdSchema });

export type BeginMediaUploadInput = z.infer<typeof beginMediaUploadSchema>;
export type FinalizeMediaUploadInput = z.infer<typeof finalizeMediaUploadSchema>;
