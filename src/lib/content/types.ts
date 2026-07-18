import type { Database } from "@/lib/supabase/database.types";

export type HomepageSectionRow = Database["public"]["Tables"]["homepage_sections"]["Row"];
export type ContentPageRow = Database["public"]["Tables"]["content_pages"]["Row"];
export type NavigationMenuRow = Database["public"]["Tables"]["navigation_menus"]["Row"];
export type NavigationItemRow = Database["public"]["Tables"]["navigation_items"]["Row"];
export type FooterColumnRow = Database["public"]["Tables"]["footer_columns"]["Row"];
export type FooterItemRow = Database["public"]["Tables"]["footer_items"]["Row"];
export type SocialLinkRow = Database["public"]["Tables"]["social_links"]["Row"];

export type HomepageSection = HomepageSectionRow & {
  readonly productIds: readonly number[];
  readonly categoryIds: readonly number[];
  readonly bundleIds: readonly number[];
};

export type ContentPage = ContentPageRow & { readonly renderedHtml: string };
export type NavigationItem = NavigationItemRow & { readonly children: readonly NavigationItem[] };
export type Navigation = NavigationMenuRow & { readonly items: readonly NavigationItem[] };
export type FooterColumn = FooterColumnRow & { readonly items: readonly FooterItemRow[] };
export type Footer = { readonly columns: readonly FooterColumn[]; readonly socialLinks: readonly SocialLinkRow[] };

export type ContentReadOptions = { readonly includeDrafts?: boolean };

