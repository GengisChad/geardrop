import Link from "next/link";
import { ExternalLink, LogOut } from "lucide-react";
import type { StaffRole } from "@/lib/auth/roles";
import { isGestionaleOnly } from "@/lib/app-mode";
import { organizationBrand, type OrganizationMembership } from "@/lib/org/organization";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import { AdminMobileDock, AdminNavigation } from "./admin-navigation";
import { OrderLockBanner } from "./order-lock-banner";
import { OrganizationSwitcher } from "./organization-switcher";
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
  readonly organization: OrganizationMembership;
  readonly organizations: readonly OrganizationMembership[];
};

/** Gear Drop keeps its wordmark; any other company is named as it is. */

export function AdminShell({ acceptOrders, children, displayName, role, organization, organizations }: AdminShellProps) {
  return (
    <div className={styles.adminCanvas}>
      <aside className={styles.sidebar}>
        <Link className={styles.adminBrand} href="/admin" aria-label={`${organization.name} — panoramica del gestionale`}>
          <span>{organizationBrand(organization)}</span>
          <small>GESTIONALE</small>
        </Link>
        <AdminNavigation />
        <p className={styles.railFootnote}>Console operativa · Catalogo e stock</p>
      </aside>

      <div className={styles.workspace}>
        <OrderLockBanner acceptOrders={acceptOrders} />
        <header className={styles.topbar}>
          <Link className={styles.staffIdentity} href="/admin/account" aria-label={`${displayName}, il mio account`}>
            <strong>{displayName}</strong>
            <span>{ROLE_LABELS[role]}</span>
          </Link>
          <div className={styles.topbarActions}>
            <OrganizationSwitcher current={organization} organizations={organizations} />
            {organization.storefrontPublic ? (
              // The management app has no shop of its own: it opens the live one.
              isGestionaleOnly() ? (
                <a href={PRODUCTION_ORIGIN} className={styles.storeLink} aria-label="Visualizza negozio" rel="noreferrer" target="_blank">
                  <span>Visualizza negozio</span> <ExternalLink size={16} aria-hidden="true" />
                </a>
              ) : (
                <Link href="/" className={styles.storeLink} aria-label="Visualizza negozio">
                  <span>Visualizza negozio</span> <ExternalLink size={16} aria-hidden="true" />
                </Link>
              )
            ) : null}
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
