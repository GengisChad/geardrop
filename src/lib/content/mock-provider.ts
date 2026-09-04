import { SUPPORT_PAGES } from "@/data/pages";
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
      return null;
    },
    async getHomepage() { return null; },
  };
}
