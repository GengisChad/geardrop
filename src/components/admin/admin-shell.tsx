import Link from "next/link";
import { ExternalLink, LogOut } from "lucide-react";
import type { StaffRole } from "@/lib/auth/roles";
import { AdminMobileDock, AdminNavigation } from "./admin-navigation";
import { OrderLockBanner } from "./order-lock-banner";
import styles from "./admin.module.css";

const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Proprietario",
  admin: "Admin",
  editor: "Editor",
};

type AdminShellProps = {
  readonly acceptOrders: boolean;
  readonly children: React.ReactNode;
  readonly displayName: string;
  readonly role: StaffRole;
};

export function AdminShell({ acceptOrders, children, displayName, role }: AdminShellProps) {
  return (
    <div className={styles.adminCanvas}>
      <aside className={styles.sidebar}>
        <Link className={styles.adminBrand} href="/admin" aria-label="GEAR DROP Admin — panoramica">
          <span>GEAR//DROP</span>
          <small>ADMIN CONSOLE</small>
        </Link>
        <AdminNavigation />
        <p className={styles.railFootnote}>Console operativa · Catalogo e stock</p>
      </aside>

      <div className={styles.workspace}>
        <OrderLockBanner acceptOrders={acceptOrders} />
        <header className={styles.topbar}>
          <div className={styles.staffIdentity}>
            <strong>{displayName}</strong>
            <span>{ROLE_LABELS[role]}</span>
          </div>
          <div className={styles.topbarActions}>
            <Link href="/" className={styles.storeLink} aria-label="Visualizza negozio">
              <span>Visualizza negozio</span> <ExternalLink size={16} aria-hidden="true" />
            </Link>
            <form action="/admin/logout" method="post">
              <button
                aria-label="Esci dall’amministrazione"
                className={styles.logoutButton}
                type="submit"
              >
                <LogOut size={16} aria-hidden="true" />
                <span>Esci</span>
              </button>
            </form>
          </div>
        </header>
        <main className={styles.content} id="contenuto">
          {children}
        </main>
      </div>
      <AdminMobileDock />
    </div>
  );
}
