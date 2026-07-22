import { describe, expect, it, vi } from "vitest";
import { readMediaUploadConfig } from "@/lib/admin/media-config.server";

vi.mock("server-only", () => ({}));

describe("admin media upload configuration", () => {
  it("defaults to eight and accepts an explicit bounded integer", () => {
    expect(readMediaUploadConfig({}).batchLimit).toBe(8);
    expect(readMediaUploadConfig({ ADMIN_MEDIA_UPLOAD_BATCH_LIMIT: "12" }).batchLimit).toBe(12);
  });

  it("rejects malformed and out-of-range limits", () => {
    for (const value of ["0", "21", "2.5", "many", " 8 "]) {
      expect(() => readMediaUploadConfig({ ADMIN_MEDIA_UPLOAD_BATCH_LIMIT: value })).toThrow();
    }
  });
});
