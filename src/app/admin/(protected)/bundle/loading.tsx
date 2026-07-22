import styles from "@/components/admin/catalog/catalog.module.css";

export default function BundlesLoading() {
  return <div className={styles.page} aria-busy="true" aria-label="Caricamento bundle"><div className={styles.skeleton} /><div className={styles.skeleton} /><div className={styles.skeleton} /></div>;
}

