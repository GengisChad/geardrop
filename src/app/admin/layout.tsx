import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/admin/register-service-worker";

// The admin installs as an app ("Installa Gestionale" in the browser, "Aggiungi a Home" on iOS).
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  applicationName: "Gestionale",
  appleWebApp: { capable: true, title: "Gestionale", statusBarStyle: "default" },
  icons: { icon: "/icons/gestionale-192.png", apple: "/icons/gestionale-180.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#7a3cff",
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <RegisterServiceWorker />
    </>
  );
}
