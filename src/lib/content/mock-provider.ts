import { PRODUCTS, brandOf } from "@/data/catalog";
import { LEGAL_PAGES, SUPPORT_PAGES } from "@/data/pages";
import { FOOTER_NAV, SOCIAL_LINKS, buildMainNav } from "@/lib/navigation";
import type { StorefrontContentProvider } from "./types";

export function createMockContentProvider(): StorefrontContentProvider {
  return {
    name: "mock",
    async getChrome() {
      const hasTakara = PRODUCTS.some((p) => brandOf(p) === "takara-tomy");
      const nav = buildMainNav({ hasTakara });
      return {
        desktopNavigation: nav,
        mobileNavigation: nav,
        footerColumns: FOOTER_NAV,
        socialLinks: SOCIAL_LINKS.map(({ label, href }) => ({ label, href })),
      };
    },
    async getPage(slug) {
      const page = SUPPORT_PAGES[slug as keyof typeof SUPPORT_PAGES] ?? LEGAL_PAGES[slug as keyof typeof LEGAL_PAGES];
      if (page) return { title: page.title, lead: page.lead, legacy: page };
      return null;
    },
    async getHomepage() { return null; },
  };
}
