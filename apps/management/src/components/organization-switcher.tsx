"use client";

/**
 * Selettore dell'organizzazione corrente.
 *
 * Compare solo se il principal ha più di un'organizzazione attiva.
 * Ogni form chiama setOrganization.bind() — action server importata
 * nel client (pattern Next.js documentato). La validazione dello slug
 * avviene dentro setOrganization (DB, non input).
 *
 * Client Component: deve essere importabile da ManagementShell (client).
 * Non ha stato locale né hook: è un form con server action inline.
 */
import type { OrganizationMembership } from "@geardrop/data-contract";
import { setOrganization } from "@/app/actions/organization";
import styles from "@/app/management.module.css";

interface OrganizationSwitcherProps {
  current: OrganizationMembership;
  organizations: readonly OrganizationMembership[];
}

export function OrganizationSwitcher({
  current,
  organizations,
}: OrganizationSwitcherProps) {
  if (organizations.length <= 1) return null;

  return (
    <div className={styles.switcherSection}>
      <p className={styles.switcherLabel}>Aziende</p>
      <div className={styles.switcherList}>
        {organizations.map((org) => {
          const isActive = org.id === current.id;
          return isActive ? (
            <span
              key={org.id}
              className={`${styles.switcherBtn} ${styles.switcherBtnActive}`}
              aria-current="true"
            >
              {org.name}
            </span>
          ) : (
            <form key={org.id} action={setOrganization.bind(null, org.slug)}>
              <button type="submit" className={styles.switcherBtn}>
                {org.name}
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
