import "server-only";

import { MEDIA_BATCH_DEFAULT, MEDIA_BATCH_HARD_MAX } from "@/lib/admin/media";

export type MediaUploadConfig = {
  readonly batchLimit: number;
};

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export function readMediaUploadConfig(source: EnvironmentSource = process.env): MediaUploadConfig {
  const rawLimit = source.ADMIN_MEDIA_UPLOAD_BATCH_LIMIT;
  if (rawLimit === undefined || rawLimit === "") {
    return { batchLimit: MEDIA_BATCH_DEFAULT };
  }

  if (!/^[1-9][0-9]*$/.test(rawLimit)) {
    throw new Error("ADMIN_MEDIA_UPLOAD_BATCH_LIMIT must be an integer between 1 and 20");
  }

  const batchLimit = Number(rawLimit);
  if (!Number.isSafeInteger(batchLimit) || batchLimit > MEDIA_BATCH_HARD_MAX) {
    throw new Error("ADMIN_MEDIA_UPLOAD_BATCH_LIMIT must be an integer between 1 and 20");
  }

  return { batchLimit };
}
