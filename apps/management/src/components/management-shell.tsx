"use client";

/**
 * Shell del gestionale: sidebar di navigazione + area contenuto.
 *
 * Client Component necessario per leggere il pathname corrente e marcare
 * il link attivo. I figli (children) sono Server Component renderizzati
 * dal layout e passati come slot: il confine server/client è rispettato.
 *
 * Riceve solo dati serializzabili dal layout (Server Component):
 * - orgName, role: mostrati nell'intestazione
 * - organizations: passati a OrganizationSwitcher per il cambio azienda
 * - children: la pagina corrente
 *
 * Navigazione: Panoramica, Account, Sicurezza, separatore, Esci.
 * Nessun quick link che scriva dati di business.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { OrganizationMembership } from "@geardrop/data-contract";
import { OrganizationSwitcher } from "./organization-switcher";
import styles from "@/app/management.module.css";

interface ManagementShellProps {
  orgName: string;
  role: string;
  organizations: readonly OrganizationMembership[];
  currentOrgId: number;
  children: ReactNode;
}

const NAV_ITEMS = [
  { href: "/", label: "Panoramica" },
  { href: "/account", label: "Account" },
  { href: "/settings/security", label: "Sicurezza" },
] as const;

export function ManagementShell({
  orgName,
  role,
  organizations,
  currentOrgId,
  children,
}: ManagementShellProps) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  // Ricostruisce il current membership da id (già validato server-side)
  const current = organizations.find((o) => o.id === currentOrgId);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Navigazione gestionale">
        {/* Intestazione azienda */}
        <div className={styles.orgHeader}>
          <p className={styles.orgName}>{orgName}</p>
          <p className={styles.orgRole}>{role}</p>
        </div>

        {/* Navigazione principale */}
        <nav className={styles.nav} aria-label="Menu principale">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={
                isActive(href)
                  ? `${styles.navLink} ${styles.navLinkActive}`
                  : styles.navLink
              }
              aria-current={isActive(href) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}

          <div className={styles.navDivider} role="separator" />

          <Link href="/logout" className={styles.navLink}>
            Esci
          </Link>
        </nav>

        {/* Selettore azienda (visibile solo con più di un'organizzazione) */}
        {current && (
          <OrganizationSwitcher
            current={current}
            organizations={organizations}
          />
        )}
      </aside>

      {/* Area contenuto principale */}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
