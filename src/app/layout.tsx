import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import { brand } from "@/data/assets";
import "@/styles/globals.css";

/**
 * The design system declares DIN Next / Eurostile Extended for headings; both are
 * commercial. Archivo is the closest free grotesque with a real width axis, so the
 * extended cut is genuine rather than faked with letter-spacing. (audit §3)
 */
// No `weight`: that keeps it a true variable font, which `axes` requires.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://geardrop.it"),
  title: {
    default: "GEAR//DROP — Beyblade X per la community italiana",
    template: "%s | GEAR//DROP",
  },
  description:
    "Trottole, lanciatori, stadi e accessori Beyblade X. Prodotti originali, spedizione veloce in tutta Italia, drop settimanali.",
  applicationName: "GEAR//DROP",
  icons: {
    icon: "/favicon.ico",
    apple: brand.appleIcon,
  },
  openGraph: {
    type: "website",
    locale: "it_IT",
    siteName: "GEAR//DROP",
    title: "GEAR//DROP — Beyblade X per la community italiana",
    description: "Prodotti ufficiali, prestazioni estreme, community italiana.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#121417",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${archivo.variable} ${inter.variable}`}>
      <body className="min-h-dvh">
        <Providers>
          <a
            href="#contenuto"
            className="gd-display sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-lime focus:px-5 focus:py-3 focus:text-small focus:font-bold focus:text-graphite"
          >
            Salta al contenuto
          </a>
          {children}
        </Providers>
      </body>
    </html>
  );
}
