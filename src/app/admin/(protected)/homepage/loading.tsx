import styles from "@/components/admin/homepage/homepage.module.css";

export default function AdminHomepageLoading() {
  return <div className={styles.page} aria-busy="true" aria-label="Caricamento homepage"><div className={styles.skeleton} /><div className={styles.skeleton} /></div>;
}
