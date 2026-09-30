import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = { title: "GEAR//DROP — Gestionale", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="it"><body>{children}</body></html>;
}
