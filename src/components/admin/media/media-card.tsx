import Image from "next/image";
import { deleteMediaAssetFormAction } from "@/app/admin/actions/media";
import type { StaffRole } from "@/lib/auth/roles";
import type { AdminMediaItem } from "@/lib/admin/media-repository";
import styles from "./media.module.css";

export function MediaCard({ item, role }: { readonly item: AdminMediaItem; readonly role: StaffRole }) {
  const manager = role === "owner" || role === "admin";
  return <article className={styles.card}>
    <div className={styles.preview}>{item.previewUrl ? <Image alt={item.alt_text} fill sizes="(max-width: 700px) 100vw, 25vw" src={item.previewUrl} unoptimized /> : <span>{item.status}</span>}</div>
    <div className={styles.cardBody}><span className={styles.state} data-status={item.status}>{item.status}</span><h2>{item.original_filename}</h2><p>{item.alt_text}</p><dl><div><dt>Dimensioni</dt><dd>{item.width}×{item.height}</dd></div><div><dt>Uso</dt><dd>{item.usageCount}</dd></div></dl>
      {manager ? <form action={deleteMediaAssetFormAction}><input name="mediaAssetId" type="hidden" value={item.id} /><button disabled={item.usageCount > 0} type="submit">Elimina asset</button></form> : null}
    </div>
  </article>;
}
