"use client";

import { Building2 } from "lucide-react";
import { switchOrganizationAction } from "@/app/admin/actions/organization";
import type { OrganizationMembership } from "@/lib/org/organization";
import styles from "./admin.module.css";

type OrganizationSwitcherProps = {
  readonly current: OrganizationMembership;
  readonly organizations: readonly OrganizationMembership[];
};

/**
 * The company the admin is working in, always visible. With more than one company it is a
 * select that switches on change; without JavaScript the button submits the same form.
 */
export function OrganizationSwitcher({ current, organizations }: OrganizationSwitcherProps) {
  if (organizations.length < 2) {
    return (
      <p className={styles.organizationBadge} data-testid="organization-current">
        <Building2 size={16} aria-hidden="true" />
        <span>{current.name}</span>
      </p>
    );
  }

  return (
    <form action={switchOrganizationAction} className={styles.organizationSwitcher}>
      <Building2 size={16} aria-hidden="true" />
      <label className={styles.visuallyHidden} htmlFor="organization-switcher">
        Azienda
      </label>
      <select
        data-testid="organization-switcher"
        defaultValue={current.slug}
        id="organization-switcher"
        name="organization"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {organizations.map((organization) => (
          <option key={organization.slug} value={organization.slug}>
            {organization.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit">Cambia</button>
      </noscript>
    </form>
  );
}
