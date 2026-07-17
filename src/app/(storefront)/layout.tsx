import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main id="contenuto" className="pb-20 lg:pb-0">
        {children}
      </main>
      <Footer />
      <BottomTabBar />
    </>
  );
}
