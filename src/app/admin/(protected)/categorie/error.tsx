"use client";

import styles from "@/components/admin/catalog/catalog.module.css";

export default function CategoriesError({ reset }: { readonly reset: () => void }) {
  return <section className={styles.empty}><strong>Categorie non disponibili</strong><p>Query reale non completata. Nessun dato sostitutivo mostrato.</p><button onClick={reset} type="button">Riprova</button></section>;
}

