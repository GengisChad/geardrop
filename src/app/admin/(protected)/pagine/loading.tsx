import styles from "@/components/admin/content/content.module.css";
export default function PagesLoading() { return <div aria-busy="true" className={styles.page}><div className={styles.skeleton} /><div className={styles.skeleton} /></div>; }
