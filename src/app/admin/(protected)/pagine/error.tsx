"use client";
import styles from "@/components/admin/content/content.module.css";
export default function PagesError({ reset }: { readonly reset: () => void }) { return <div className={styles.empty} role="alert">Pagine non disponibili. <button onClick={reset} type="button">Riprova</button></div>; }
