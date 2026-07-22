"use client";

import styles from "@/components/admin/homepage/homepage.module.css";

export default function AdminHomepageError({ reset }: { readonly reset: () => void }) {
  return <div className={styles.emptyState} role="alert"><strong>Homepage non disponibile</strong><p>La lettura del CMS reale non è riuscita.</p><button onClick={reset} type="button">Riprova</button></div>;
}
