"use client";
import styles from "@/components/admin/content/content.module.css";
export default function FooterError({ reset }: { readonly reset: () => void }) { return <div className={styles.empty} role="alert">Footer non disponibile. <button onClick={reset} type="button">Riprova</button></div>; }
