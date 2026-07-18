import { describe, expect, it } from "vitest";
import {
  beginMediaUpload,
  deleteMediaAsset,
  finalizeMediaUpload,
  processMediaBatch,
  replaceMediaAsset,
  type MediaServiceDependencies,
  type PendingMediaAsset,
} from "@/lib/admin/media-service";

const validFile = {
  originalFilename: "blade.webp",
  mimeType: "image/webp" as const,
  byteSize: 4096,
  width: 320,
  height: 240,
  altText: "Blade front view",
};

function dependencies() {
  const pending = new Map<number, PendingMediaAsset>();
  const removedPaths: string[] = [];
  let nextId = 1;
  let swappedAssociations = false;
  const deps: MediaServiceDependencies = {
    principal: { userId: "00000000-0000-0000-0000-000000000777", role: "admin" },
    now: () => new Date("2026-07-18T12:00:00.000Z"),
    randomUUID: () => "11111111-2222-4333-8444-555555555555",
    inspectImage: async () => ({ format: "webp", width: 320, height: 240 }),
    repository: {
      reserve: async (input) => {
        const id = nextId++;
        pending.set(id, { id, status: "pending", ...input });
        return id;
      },
      get: async (id) => pending.get(id) ?? null,
      finalize: async (id) => {
        const asset = pending.get(id);
        if (!asset) throw new Error("missing");
        pending.set(id, { ...asset, status: "ready" });
      },
      fail: async (id) => {
        const asset = pending.get(id);
        if (asset) pending.set(id, { ...asset, status: "failed" });
      },
      swapAssociations: async () => {
        swappedAssociations = true;
        return { updatedCount: 1, oldAssetUnused: false };
      },
      beginDelete: async (id) => {
        const asset = pending.get(id);
        if (!asset) throw new Error("missing");
        return asset.objectPath;
      },
      completeDelete: async (id) => { pending.delete(id); },
    },
    storage: {
      createSignedUploadUrl: async () => ({ token: "signed-token" }),
      download: async () => new Blob([new Uint8Array(4096)], { type: "image/webp" }),
      remove: async (path) => { removedPaths.push(path); },
    },
  };
  return { deps, pending, removedPaths, swapped: () => swappedAssociations };
}

describe("admin media service", () => {
  it("generates a server-owned path and ignores browser path segments", async () => {
    const state = dependencies();
    const result = await beginMediaUpload({ ...validFile, originalFilename: "C:\\fakepath\\blade.webp" }, state.deps);
    expect(result).toEqual({
      ok: true,
      message: "Upload autorizzato.",
      data: {
        mediaAssetId: 1,
        objectPath: "00000000-0000-0000-0000-000000000777/2026-07-18/11111111-2222-4333-8444-555555555555.webp",
        token: "signed-token",
      },
    });
  });

  it("finalizes only when downloaded bytes and decoded metadata match", async () => {
    const state = dependencies();
    const ticket = await beginMediaUpload(validFile, state.deps);
    if (!ticket.ok) throw new Error("ticket failed");
    const result = await finalizeMediaUpload({ mediaAssetId: ticket.data.mediaAssetId, ...validFile }, state.deps);
    expect(result.ok).toBe(true);
    expect(state.pending.get(1)?.status).toBe("ready");
    expect(state.removedPaths).toEqual([]);
  });

  it("compensates a corrupt finalization without exposing the asset", async () => {
    const state = dependencies();
    const ticket = await beginMediaUpload(validFile, state.deps);
    if (!ticket.ok) throw new Error("ticket failed");
    state.deps.inspectImage = async () => ({ format: "png", width: 10, height: 10 });
    const result = await finalizeMediaUpload({ mediaAssetId: ticket.data.mediaAssetId, ...validFile }, state.deps);
    expect(result.ok).toBe(false);
    expect(state.pending.get(1)?.status).toBe("failed");
    expect(state.removedPaths).toEqual([ticket.data.objectPath]);
  });

  it("keeps previous associations when replacement finalization fails", async () => {
    const state = dependencies();
    state.deps.storage.download = async () => { throw new Error("corrupt"); };
    const result = await replaceMediaAsset({ oldMediaAssetId: 99, file: validFile }, state.deps);
    expect(result.ok).toBe(false);
    expect(state.swapped()).toBe(false);
    expect(state.removedPaths).toEqual([
      "00000000-0000-0000-0000-000000000777/2026-07-18/11111111-2222-4333-8444-555555555555.webp",
    ]);
  });

  it("isolates batch failures and preserves input order", async () => {
    const files = ["png", "svg", "webp"] as const;
    const results = await processMediaBatch(files, async (file) => file === "svg"
      ? { ok: false, code: "invalid", message: "SVG vietato" }
      : { ok: true, message: "ok", data: file }, 3);
    expect(results.map((item) => item.ok)).toEqual([true, false, true]);
    expect(results[2]).toMatchObject({ data: "webp" });
  });

  it("keeps delete manager-only and completes only after Storage removal", async () => {
    const state = dependencies();
    const ticket = await beginMediaUpload(validFile, state.deps);
    if (!ticket.ok) throw new Error("ticket failed");
    state.deps.principal = { ...state.deps.principal, role: "editor" };
    expect((await deleteMediaAsset({ mediaAssetId: 1 }, state.deps)).ok).toBe(false);
    state.deps.principal = { ...state.deps.principal, role: "admin" };
    expect((await deleteMediaAsset({ mediaAssetId: 1 }, state.deps)).ok).toBe(true);
    expect(state.removedPaths).toHaveLength(1);
    expect(state.pending.has(1)).toBe(false);
  });
});
