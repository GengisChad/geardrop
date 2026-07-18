"use client";
import styles from "@/components/admin/content/content.module.css";
export default function NavigationError({ reset }: { readonly reset: () => void }) { return <div className={styles.empty} role="alert">Navigazione non disponibile. <button onClick={reset} type="button">Riprova</button></div>; }
