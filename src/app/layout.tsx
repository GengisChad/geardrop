import type { Metadata, Viewport } from "next";
import { Chakra_Petch, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { brand } from "@/data/assets";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE_NAME } from "@/lib/seo";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import "@/styles/globals.css";

/**
 * Holo Drop type pairing: Chakra Petch's squared, techy forms carry headlines (italic),
 * UI labels and body copy; JetBrains Mono sets HUD data such as counters and codes.
 */
const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
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
};

export const viewport: Viewport = {
  themeColor: "#07060b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${chakra.variable} ${jetbrains.variable}`}>
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
