"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV_ITEMS, isAdminNavItemActive } from "@/lib/admin/navigation";
import styles from "./admin.module.css";

export function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigazione amministrazione" className={styles.navList}>
      {ADMIN_NAV_ITEMS.map((item) => {
        const active = isAdminNavItemActive(pathname, item.href);

        if (item.disabled) {
          return (
            <span className={styles.navDisabled} aria-disabled="true" key={item.label}>
              <span>{item.label}</span>
              <span className={styles.lockedLabel}>Non disponibile</span>
            </span>
          );
        }

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={styles.navLink}
            data-active={active || undefined}
            href={item.href as Route}
            key={item.label}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminMobileDock() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigazione amministrazione mobile" className={styles.mobileDock}>
      {ADMIN_NAV_ITEMS.filter((item) => !item.disabled).map((item) => {
        const active = isAdminNavItemActive(pathname, item.href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            data-active={active || undefined}
            href={item.href as Route}
            key={item.label}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
