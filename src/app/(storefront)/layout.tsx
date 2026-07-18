import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { storefrontContent } from "@/lib/content/provider";
import { getPublicStoreSettings } from "@/lib/storefront/settings-repository";

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const chrome = await storefrontContent.getChrome();
  const settings=process.env["CONTENT_PROVIDER"]==="supabase"?await getPublicStoreSettings():null;
  return (
    <>
      <Header navigation={chrome.desktopNavigation} mobileNavigation={chrome.mobileNavigation} />
      {settings?.maintenance_mode&&settings.maintenance_message?<aside className="bg-violet px-4 py-2 text-center text-small font-bold text-white" role="status">{settings.maintenance_message}</aside>:null}
      <main id="contenuto" className="pb-20 lg:pb-0">
        {children}
      </main>
      <Footer content={chrome} />
      <BottomTabBar />
    </>
  );
}
