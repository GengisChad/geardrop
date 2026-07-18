import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { storefrontContent } from "@/lib/content/provider";

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const chrome = await storefrontContent.getChrome();
  return (
    <>
      <Header navigation={chrome.desktopNavigation} mobileNavigation={chrome.mobileNavigation} />
      <main id="contenuto" className="pb-20 lg:pb-0">
        {children}
      </main>
      <Footer content={chrome} />
      <BottomTabBar />
    </>
  );
}
