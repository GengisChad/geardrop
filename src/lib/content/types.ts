import type { Database } from "@/lib/supabase/database.types";
import type { ContentPage as LegacyContentPage } from "@/data/pages";

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
export type StorefrontNavItem = { readonly label: string; readonly href: string; readonly tone?: "violet" | "lime" };
export type StorefrontFooterColumn = { readonly title: string; readonly links: readonly StorefrontNavItem[] };
export type StorefrontChrome = {
  readonly desktopNavigation: readonly StorefrontNavItem[];
  readonly mobileNavigation: readonly StorefrontNavItem[];
  readonly footerColumns: readonly StorefrontFooterColumn[];
  readonly socialLinks: readonly StorefrontNavItem[];
};
export type StorefrontManagedPage = {
  readonly title: string;
  readonly lead: string;
  readonly markdownSource?: string;
  readonly legacy?: LegacyContentPage;
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
};
export type StorefrontContentProvider = {
  readonly name: "mock" | "supabase";
  getChrome(): Promise<StorefrontChrome>;
  getPage(slug: string): Promise<StorefrontManagedPage | null>;
  getHomepage(): Promise<readonly HomepageSection[] | null>;
};

export type ContentReadOptions = { readonly includeDrafts?: boolean };

export type HomepageEditorMedia = {
  readonly id: number;
  readonly label: string;
  readonly altText: string;
  readonly previewUrl: string;
};
export type HomepageEditorOption = { readonly id: number; readonly label: string; readonly meta: string };
export type HomepageEditorResources = {
  readonly media: readonly HomepageEditorMedia[];
  readonly products: readonly HomepageEditorOption[];
  readonly categories: readonly HomepageEditorOption[];
  readonly bundles: readonly HomepageEditorOption[];
};
