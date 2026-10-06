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
  { label: "Carichi merce", href: "/admin/carichi", disabled: false },
  { label: "Fornitori", href: "/admin/fornitori", disabled: false },
  { label: "Previsioni", href: "/admin/previsioni", disabled: false },
  { label: "Prezzi IA", href: "/admin/prezzi", disabled: false },
  { label: "Assistente", href: "/admin/assistente", disabled: false },
  { label: "Media", href: "/admin/media", disabled: false },
  { label: "Homepage", href: "/admin/homepage", disabled: false },
  { label: "Pagine", href: "/admin/pagine", disabled: false },
  { label: "Meta", href: "/admin/meta", disabled: false },
  { label: "Navigazione", href: "/admin/navigazione", disabled: false },
  { label: "Footer", href: "/admin/footer", disabled: false },
  { label: "Promozioni", href: "/admin/promozioni", disabled: false },
  { label: "Coupon", href: "/admin/coupon", disabled: false },
  { label: "Ordini", href: "/admin/ordini", disabled: false },
  { label: "Da spedire", href: "/admin/magazzino", disabled: false },
  { label: "Spedizioni", href: "/admin/spedizioni", disabled: false },
  { label: "Impostazioni", href: "/admin/impostazioni", disabled: false },
  { label: "Team", href: "/admin/team", disabled: false },
  { label: "Attività", href: "/admin/attivita", disabled: false },
];

export function isAdminNavItemActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
