import { LEGAL_PAGES, SUPPORT_PAGES } from "@/data/pages";
import { FOOTER_NAV, MAIN_NAV } from "@/lib/navigation";
import type { StorefrontContentProvider } from "./types";

export function createMockContentProvider(): StorefrontContentProvider {
  return {
    name: "mock",
    async getChrome() {
      return {
        desktopNavigation: MAIN_NAV,
        mobileNavigation: MAIN_NAV,
        footerColumns: FOOTER_NAV,
        socialLinks: [],
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
