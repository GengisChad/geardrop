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
      const support = SUPPORT_PAGES[slug as keyof typeof SUPPORT_PAGES];
      if (support) return { title: support.title, lead: support.lead, legacy: support };
      const legal = LEGAL_PAGES[slug as keyof typeof LEGAL_PAGES];
      return legal ? { title: legal.title, lead: legal.lead, legacy: legal } : null;
    },
    async getHomepage() { return null; },
  };
}
