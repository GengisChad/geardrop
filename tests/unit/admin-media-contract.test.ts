import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("admin media server boundary", () => {
  it("uses authenticated signed-upload and lifecycle boundaries", () => {
    const actions = readFileSync(join(root, "src/app/admin/actions/media.ts"), "utf8");
    const service = readFileSync(join(root, "src/lib/admin/media-service.ts"), "utf8");
    expect(actions).toContain("createSupabaseServerClient");
    expect(actions).toContain("requireStaffRole");
    expect(actions).not.toContain("service_role");
    expect(service).toContain("createSignedUploadUrl");
    expect(service).toContain("upsert: false");
    expect(service).toContain("sharp(");
    expect(service).toContain("swapAssociations");
    expect(service).toContain("beginDelete");
    expect(service).toContain("completeDelete");
    expect(service).not.toContain("console.");
  });

  it("keeps browser paths and secret keys outside media service", () => {
    const service = readFileSync(join(root, "src/lib/admin/media-service.ts"), "utf8");
    expect(service).toContain("randomUUID()");
    expect(service).toContain("principal.userId");
    expect(service).not.toContain("SUPABASE_SECRET_KEY");
    expect(service).not.toContain("originalFilename.replace");
  });

  it("renders a real media library with server-signed previews", () => {
    const page = readFileSync(join(root, "src/app/admin/(protected)/media/page.tsx"), "utf8");
    const repository = readFileSync(join(root, "src/lib/admin/media-repository.ts"), "utf8");
    expect(page).toContain("listAdminMedia");
    expect(page).toContain("requireAdminAccess");
    expect(repository).toContain("createSignedUrl");
    expect(page).toContain("Nessun media caricato");
  });

  it("uploads only through signed tickets with isolated per-file state", () => {
    const upload = readFileSync(join(root, "src/components/admin/media/media-upload-client.tsx"), "utf8");
    expect(upload).toContain("uploadToSignedUrl");
    expect(upload).toContain("multiple");
    expect(upload).toContain("onDragOver");
    expect(upload).toContain("onDrop");
    expect(upload).toContain("altText");
    expect(upload).toContain("Promise.allSettled");
    for (const status of ["pending", "uploading", "finalizing", "ready", "failed"]) {
      expect(upload).toContain(status);
    }
    expect(upload).not.toMatch(/\.upload\(|\.update\(|\.remove\(/);
    expect(upload).not.toContain("SUPABASE_SECRET_KEY");
  });
});
