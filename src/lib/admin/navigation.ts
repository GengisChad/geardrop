export type AdminNavItem = {
  readonly label: string;
  readonly href: string;
  readonly disabled: boolean;
};

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { label: "Panoramica", href: "/admin", disabled: false },
  { label: "Prodotti", href: "/admin/prodotti", disabled: false },
  { label: "Categorie", href: "/admin/categorie", disabled: false },
  { label: "Bundle", href: "/admin/bundle", disabled: false },
  { label: "Inventario", href: "/admin/inventario", disabled: false },
  { label: "Media", href: "/admin/media", disabled: false },
  { label: "Homepage", href: "/admin/homepage", disabled: true },
  { label: "Coupon", href: "/admin/coupon", disabled: true },
  { label: "Ordini", href: "/admin/ordini", disabled: true },
  { label: "Impostazioni", href: "/admin/impostazioni", disabled: true },
  { label: "Team", href: "/admin/team", disabled: true },
  { label: "Attività", href: "/admin/attivita", disabled: true },
];

export function isAdminNavItemActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
