"use client";

import { useMemo, useRef, useState } from "react";
import { beginMediaUploadAction, finalizeMediaUploadAction } from "@/app/admin/actions/media";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./media.module.css";

type UploadStatus = "pending" | "uploading" | "finalizing" | "ready" | "failed";
type UploadItem = {
  readonly id: string;
  readonly file: File;
  readonly altText: string;
  readonly status: UploadStatus;
  readonly message: string;
};

async function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

export function MediaUploadClient({ batchLimit }: { readonly batchLimit: number }) {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<readonly UploadItem[]>([]);
  const [busy, setBusy] = useState(false);

  const update = (id: string, patch: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };
  const queue = (files: FileList | readonly File[]) => {
    const next = Array.from(files).slice(0, batchLimit).map((file) => ({
      id: crypto.randomUUID(), file, altText: "", status: "pending" as const, message: "In attesa",
    }));
    setItems(next);
  };
  const uploadOne = async (item: UploadItem) => {
    try {
      if (!item.altText.trim()) throw new Error("Alt text obbligatorio");
      const dimensions = await imageDimensions(item.file);
      update(item.id, { status: "uploading", message: "Upload in corso" });
      const declaration = {
        originalFilename: item.file.name,
        mimeType: item.file.type,
        byteSize: item.file.size,
        width: dimensions.width,
        height: dimensions.height,
        altText: item.altText,
      };
      const ticket = await beginMediaUploadAction(declaration);
      if (!ticket.ok) throw new Error(ticket.message);
      const upload = await client.storage.from("product-images").uploadToSignedUrl(
        ticket.data.objectPath,
        ticket.data.token,
        item.file,
        { contentType: item.file.type },
      );
      if (upload.error) throw new Error("Upload Storage fallito");
      update(item.id, { status: "finalizing", message: "Verifica server" });
      const ready = await finalizeMediaUploadAction({ mediaAssetId: ticket.data.mediaAssetId, ...declaration });
      if (!ready.ok) throw new Error(ready.message);
      update(item.id, { status: "ready", message: "Pronto" });
    } catch (error) {
      update(item.id, { status: "failed", message: error instanceof Error ? error.message : "File non elaborato" });
    }
  };
  const start = async () => {
    setBusy(true);
    let cursor = 0;
    const snapshot = items;
    const workers = Array.from({ length: Math.min(3, snapshot.length) }, async () => {
      while (cursor < snapshot.length) {
        const item = snapshot[cursor++];
        if (item) await uploadOne(item);
      }
    });
    await Promise.allSettled(workers);
    setBusy(false);
  };

  return <section className={styles.uploader}>
    <div
      className={styles.dropzone}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => { event.preventDefault(); event.currentTarget.dataset.active = "true"; }}
      onDragLeave={(event) => { delete event.currentTarget.dataset.active; }}
      onDrop={(event) => { event.preventDefault(); delete event.currentTarget.dataset.active; queue(event.dataTransfer.files); }}
      role="button"
      tabIndex={0}
    >
      <strong>Trascina immagini o scegli file</strong><span>PNG, JPEG, WebP, AVIF · massimo {batchLimit} file</span>
      <input accept="image/png,image/jpeg,image/webp,image/avif" hidden multiple onChange={(event) => event.target.files && queue(event.target.files)} ref={inputRef} type="file" />
    </div>
    {items.length > 0 ? <div className={styles.uploadQueue}>
      {items.map((item) => <label key={item.id}><span>{item.file.name}</span><input aria-label={`Alt text ${item.file.name}`} onChange={(event) => update(item.id, { altText: event.target.value })} placeholder="Alt text obbligatorio" value={item.altText} /><b data-status={item.status}>{item.status}</b><small>{item.message}</small></label>)}
      <button disabled={busy || items.some((item) => !item.altText.trim())} onClick={start} type="button">{busy ? "Elaborazione…" : "Carica batch"}</button>
    </div> : null}
  </section>;
}
