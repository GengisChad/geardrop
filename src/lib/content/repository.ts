import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { renderSafeMarkdown } from "@/lib/content/markdown";
import type {
  ContentPage,
  ContentReadOptions,
  Footer,
  HomepageSection,
  Navigation,
  NavigationItem,
  NavigationItemRow,
} from "@/lib/content/types";
import type { Database } from "@/lib/supabase/database.types";

export const CONTENT_CACHE_TAGS = {
  homepage: "homepage",
  pages: "pages",
  navigation: "navigation",
  footer: "footer",
} as const;

function publicScope<T extends { eq(column: string, value: unknown): T }>(query: T, includeDrafts: boolean): T {
  // RLS remains authoritative; explicit filters reduce public payload and query work.
  return includeDrafts ? query : query.eq("publication_status", "published").eq("active", true);
}

export async function listHomepageSections(
  client: SupabaseClient<Database>,
  { includeDrafts = false }: ContentReadOptions = {},
): Promise<readonly HomepageSection[]> {
  const query = client.from("homepage_sections").select("*").order("sort_order").order("id");
  const sections = await publicScope(query, includeDrafts);
  if (sections.error) throw new Error("Impossibile caricare le sezioni homepage");
  if (!sections.data?.length) return [];
  const ids = sections.data.map((section) => section.id);
  const [products, categories, bundles] = await Promise.all([
    client.from("homepage_section_products").select("section_id,product_id,sort_order").in("section_id", ids).order("sort_order"),
    client.from("homepage_section_categories").select("section_id,category_id,sort_order").in("section_id", ids).order("sort_order"),
    client.from("homepage_section_bundles").select("section_id,bundle_id,sort_order").in("section_id", ids).order("sort_order"),
  ]);
  if (products.error || categories.error || bundles.error) throw new Error("Impossibile caricare i target homepage");
  return sections.data.map((section) => ({
    ...section,
    productIds: (products.data ?? []).filter((item) => item.section_id === section.id).map((item) => item.product_id),
    categoryIds: (categories.data ?? []).filter((item) => item.section_id === section.id).map((item) => item.category_id),
    bundleIds: (bundles.data ?? []).filter((item) => item.section_id === section.id).map((item) => item.bundle_id),
  }));
}

export async function getContentPage(
  client: SupabaseClient<Database>,
  slug: string,
  { includeDrafts = false }: ContentReadOptions = {},
): Promise<ContentPage | null> {
  let query = client.from("content_pages").select("*").eq("slug", slug);
  query = publicScope(query, includeDrafts);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Impossibile caricare la pagina");
  return data ? { ...data, renderedHtml: renderSafeMarkdown(data.markdown_source) } : null;
}

function buildNavigationTree(rows: readonly NavigationItemRow[], parentId: number | null): readonly NavigationItem[] {
  return rows.filter((row) => row.parent_id === parentId).map((row) => ({
    ...row,
    children: buildNavigationTree(rows, row.id),
  }));
}

export async function getNavigation(
  client: SupabaseClient<Database>,
  menuKey: string,
  { includeDrafts = false }: ContentReadOptions = {},
): Promise<Navigation | null> {
  let menuQuery = client.from("navigation_menus").select("*").eq("menu_key", menuKey);
  menuQuery = publicScope(menuQuery, includeDrafts);
  const menu = await menuQuery.maybeSingle();
  if (menu.error) throw new Error("Impossibile caricare il menu");
  if (!menu.data) return null;
  let itemQuery = client.from("navigation_items").select("*").eq("menu_id", menu.data.id).order("sort_order");
  if (!includeDrafts) itemQuery = itemQuery.eq("active", true);
  const items = await itemQuery;
  if (items.error) throw new Error("Impossibile caricare le voci menu");
  return { ...menu.data, items: buildNavigationTree(items.data ?? [], null) };
}

export async function getFooter(
  client: SupabaseClient<Database>,
  { includeDrafts = false }: ContentReadOptions = {},
): Promise<Footer> {
  let columnQuery = client.from("footer_columns").select("*").order("sort_order").order("id");
  let socialQuery = client.from("social_links").select("*").order("sort_order").order("id");
  columnQuery = publicScope(columnQuery, includeDrafts);
  socialQuery = publicScope(socialQuery, includeDrafts);
  const [columns, socialLinks] = await Promise.all([columnQuery, socialQuery]);
  if (columns.error || socialLinks.error) throw new Error("Impossibile caricare il footer");
  const columnIds = (columns.data ?? []).map((column) => column.id);
  if (columnIds.length === 0) return { columns: [], socialLinks: socialLinks.data ?? [] };
  let itemQuery = client.from("footer_items").select("*").in("column_id", columnIds).order("sort_order");
  if (!includeDrafts) itemQuery = itemQuery.eq("active", true);
  const items = await itemQuery;
  if (items.error) throw new Error("Impossibile caricare le voci footer");
  return {
    columns: (columns.data ?? []).map((column) => ({
      ...column,
      items: (items.data ?? []).filter((item) => item.column_id === column.id),
    })),
    socialLinks: socialLinks.data ?? [],
  };
}
