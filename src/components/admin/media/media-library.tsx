import type { StaffRole } from "@/lib/auth/roles";
import type { AdminMediaItem } from "@/lib/admin/media-repository";
import { MediaCard } from "./media-card";
import styles from "./media.module.css";

export function MediaLibrary({ items, role }: { readonly items: readonly AdminMediaItem[]; readonly role: StaffRole }) {
  return <section className={styles.library} aria-label="Media library">{items.map((item) => <MediaCard item={item} key={item.id} role={role} />)}</section>;
}
