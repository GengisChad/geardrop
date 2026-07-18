import { describe, expect, it } from "vitest";
import {
  MEDIA_BATCH_DEFAULT,
  MEDIA_BATCH_HARD_MAX,
  MEDIA_FILE_MAX_BYTES,
  associateMediaSchema,
  beginMediaUploadSchema,
  finalizeMediaUploadSchema,
  mediaBatchSchema,
  replaceMediaSchema,
} from "@/lib/admin/media";

const validFile = {
  originalFilename: "blade.webp",
  mimeType: "image/webp",
  byteSize: 4096,
  width: 320,
  height: 240,
  altText: "Blade front view",
};

describe("admin media contracts", () => {
  it("pins upload limits and accepts supported raster media", () => {
    expect(MEDIA_BATCH_DEFAULT).toBe(8);
    expect(MEDIA_BATCH_HARD_MAX).toBe(20);
    expect(MEDIA_FILE_MAX_BYTES).toBe(10_485_760);
    expect(beginMediaUploadSchema.safeParse(validFile).success).toBe(true);
  });

  it("rejects SVG by MIME and filename", () => {
    expect(beginMediaUploadSchema.safeParse({
      ...validFile,
      originalFilename: "blade.svg",
      mimeType: "image/svg+xml",
    }).success).toBe(false);
    expect(beginMediaUploadSchema.safeParse({
      ...validFile,
      originalFilename: "blade.svg",
      mimeType: "image/webp",
    }).success).toBe(false);
  });

  it("rejects oversized files and batches above the hard maximum", () => {
    expect(beginMediaUploadSchema.safeParse({ ...validFile, byteSize: MEDIA_FILE_MAX_BYTES + 1 }).success).toBe(false);
    expect(mediaBatchSchema.safeParse(Array.from({ length: 21 }, () => validFile)).success).toBe(false);
  });

  it("validates finalization, replacement, and association identities", () => {
    expect(finalizeMediaUploadSchema.safeParse({ mediaAssetId: 1, ...validFile }).success).toBe(true);
    expect(replaceMediaSchema.safeParse({ oldMediaAssetId: 1, newMediaAssetId: 1 }).success).toBe(false);
    expect(associateMediaSchema.safeParse({ productId: 1, mediaAssetId: 2 }).success).toBe(true);
  });
});
