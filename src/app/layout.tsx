import type { Metadata, Viewport } from "next";
import { Anybody, Chakra_Petch, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { brand } from "@/data/assets";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE_NAME } from "@/lib/seo";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import "@/styles/globals.css";

/**
 * X-Rail type (owner, 2026-10-23): Anybody, one variable family whose width axis gives the
 * expanded italic display, the condensed product names and the body copy. JetBrains Mono
 * sets part codes. Chakra Petch only draws the wordmark beside the emblem, as approved.
 */
const anybody = Anybody({
  subsets: ["latin"],
  axes: ["wdth"],
  style: ["normal", "italic"],
  variable: "--font-anybody",
  display: "swap",
});

const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: "700",
  style: "italic",
  variable: "--font-chakra",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCTION_ORIGIN),
  title: {
    default: DEFAULT_TITLE,
    template: "%s | GEAR//DROP",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["Beyblade X", "Beyblade", "trottole Beyblade X", "Beyblade X Italia", "negozio Beyblade", "lanciatore Beyblade", "stadio Beyblade X"],
  icons: {
    icon: "/favicon.ico",
    apple: brand.appleIcon,
  },
  openGraph: {
    type: "website",
    locale: "it_IT",
    siteName: SITE_NAME,
    url: PRODUCTION_ORIGIN,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  robots: { index: true, follow: true },
  // Merchant Center's claim on geardropshop.it. Public by design; removing it un-verifies the store.
  verification: { google: "JNUM4raMzlZSW65wFPpEOJ7S9IcM6RffInMwIanf-W4" },
};

export const viewport: Viewport = {
  themeColor: "#0b0a0f",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-scroll-behavior: Next 16 keeps the CSS smooth scrolling for in-page links and turns it
    // off while it changes page, so a product opened from low in the catalogue starts at its top
    // instead of gliding up from the footer (and the card-to-product photo lands where it should).
    <html lang="it" data-scroll-behavior="smooth" className={`${anybody.variable} ${chakra.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh">
        <Providers>
          <a
            href="#contenuto"
            className="gd-display sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-lime focus:px-5 focus:py-3 focus:text-small focus:font-bold focus:text-void"
          >
            Salta al contenuto
          </a>
          {children}
        </Providers>
      </body>
    </html>
  );
}
