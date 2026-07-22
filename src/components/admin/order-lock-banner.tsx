import { LockKeyhole } from "lucide-react";
import styles from "./admin.module.css";

export function OrderLockBanner({ acceptOrders }: { acceptOrders: boolean }) {
  if (acceptOrders) {
    return (
      <div className={`${styles.orderRail} ${styles.orderRailEnabled}`} role="status">
        <span className={styles.orderStateDot} aria-hidden="true" />
        Ordini attivi
      </div>
    );
  }

  return (
    <div className={styles.orderRail} role="alert">
      <LockKeyhole size={18} aria-hidden="true" />
      <span>
        Gli ordini sono disabilitati. Completa configurazione, stock e pagamenti prima dell’attivazione.
      </span>
    </div>
  );
}
