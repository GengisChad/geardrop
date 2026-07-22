import styles from "@/components/admin/catalog/catalog.module.css";

export default function CategoriesLoading() {
  return <div className={styles.page} aria-busy="true" aria-label="Caricamento categorie"><div className={styles.skeleton} /><div className={styles.skeleton} /><div className={styles.skeleton} /></div>;
}

