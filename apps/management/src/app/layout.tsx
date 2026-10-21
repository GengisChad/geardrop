import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ManagementPwa } from "@/components/management-pwa";
import "./globals.css";

// Titolo neutro: la persona non ha ancora scelto un'azienda quando vede questo.
// noindex conservato: il gestionale non deve comparire nei motori di ricerca.
export const metadata: Metadata = {
  title: "Gestionale",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <head>
        <link rel="manifest" href="/management.webmanifest" />
      </head>
      <body>
        {children}
        <ManagementPwa />
      </body>
    </html>
  );
}
