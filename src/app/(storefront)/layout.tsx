import { CookieConsent } from "@/components/analytics/cookie-consent";
import { StorefrontAnalytics } from "@/components/analytics/storefront-analytics";
import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { storefrontContent } from "@/lib/content/provider";
import { getPublicStoreSettings } from "@/lib/storefront/settings-repository";

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const chrome = await storefrontContent.getChrome();
  const settings=process.env["CONTENT_PROVIDER"]==="supabase"?await getPublicStoreSettings():null;
  const analyticsEnabled = process.env["VERCEL_ENV"] === "production";
  // Google Analytics, and the banner that asks for it, run on the live site only. COOKIE_BANNER_PREVIEW
  // shows them on a local build (point NEXT_PUBLIC_GA_MEASUREMENT_ID at a test property first).
  const googleAnalyticsEnabled = analyticsEnabled || process.env["COOKIE_BANNER_PREVIEW"] === "1";
  return (
    <>
      <Header navigation={chrome.desktopNavigation} mobileNavigation={chrome.mobileNavigation} />
      {settings?.maintenance_mode&&settings.maintenance_message?<aside className="bg-violet px-4 py-2 text-center text-small font-bold text-white" role="status">{settings.maintenance_message}</aside>:null}
      <main id="contenuto">
        {children}
      </main>
      <Footer content={chrome} cookieSettings={googleAnalyticsEnabled} />
      <BottomTabBar />
      <StorefrontAnalytics enabled={analyticsEnabled} />
      <CookieConsent enabled={googleAnalyticsEnabled} />
    </>
  );
}
