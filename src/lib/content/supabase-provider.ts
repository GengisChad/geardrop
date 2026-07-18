import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getContentPage, getFooter, getNavigation, listHomepageSections } from "./repository";
import type { StorefrontContentProvider, StorefrontNavItem } from "./types";

function flatten(items: readonly { label: string; href: string; active: boolean; children: readonly unknown[] }[]): StorefrontNavItem[] {
  return items.filter((item) => item.active).map(({ label, href }) => ({ label, href }));
}

export function createSupabaseContentProvider(): StorefrontContentProvider {
  return {
    name: "supabase",
    async getChrome() {
      const client = await createSupabaseServerClient();
      const [desktop, mobile, footer] = await Promise.all([
        getNavigation(client, "desktop"),
        getNavigation(client, "mobile"),
        getFooter(client),
      ]);
      return {
        desktopNavigation: flatten(desktop?.items ?? []),
        mobileNavigation: flatten(mobile?.items ?? []),
        footerColumns: footer.columns.map((column) => ({
          title: column.title,
          links: column.items.filter((item) => item.active).map((item) => ({ label: item.label, href: item.href })),
        })),
        socialLinks: footer.socialLinks.map((item) => ({ label: item.label, href: item.href })),
      };
    },
    async getPage(slug) {
      const client = await createSupabaseServerClient();
      const page = await getContentPage(client, slug);
      return page ? {
        title: page.title,
        lead: page.excerpt ?? "",
        markdownSource: page.markdown_source,
        seoTitle: page.seo_title,
        seoDescription: page.seo_description,
      } : null;
    },
    async getHomepage() {
      const client = await createSupabaseServerClient();
      return listHomepageSections(client);
    },
  };
}
