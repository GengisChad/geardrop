import type { AppHref } from "@/lib/routes";

export type NavItem = {
  readonly label: string;
  readonly href: AppHref;
  /** Lime = the promotional entry ("OFFERTE"); violet = the fresh one ("NUOVI ARRIVI"). */
  readonly tone?: "violet" | "lime";
};

/** Header nav, transcribed from the mockups. */
export const MAIN_NAV: readonly NavItem[] = [
  { label: "Negozio", href: "/negozio" },
  { label: "Beyblade X", href: "/negozio/beyblade-x" },
  { label: "Lanciatori", href: "/negozio/lanciatori" },
  { label: "Stadi", href: "/negozio/stadi" },
  { label: "Accessori", href: "/negozio/accessori" },
  { label: "Nuovi arrivi", href: "/negozio?sort=novita", tone: "violet" },
  { label: "Offerte", href: "/negozio?stock=disponibile", tone: "lime" },
];

export const ANNOUNCEMENTS = [
  { icon: "package", text: "Spedizione gratuita sopra 59€" },
  { icon: "zap", text: "Nuovi drop ogni settimana" },
  { icon: "crown", text: "Club GEAR//DROP" },
] as const;

/** Footer columns, transcribed from mockup-home-lower. */
export const FOOTER_NAV: readonly { title: string; links: readonly NavItem[] }[] = [
  {
    title: "Negozio",
    links: [
      { label: "Beyblade X", href: "/negozio/beyblade-x" },
      { label: "Lanciatori", href: "/negozio/lanciatori" },
      { label: "Stadi", href: "/negozio/stadi" },
      { label: "Accessori", href: "/negozio/accessori" },
      { label: "Nuovi arrivi", href: "/negozio?sort=novita" },
    ],
  },
  {
    title: "Aiuto",
    links: [
      { label: "FAQ", href: "/assistenza/faq" },
      { label: "Spedizioni", href: "/assistenza/spedizioni" },
      { label: "Resi e rimborsi", href: "/assistenza/resi" },
      { label: "Contattaci", href: "/assistenza/contatti" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Il mio account", href: "/account" },
      { label: "Lista desideri", href: "/preferiti" },
      { label: "Carrello", href: "/carrello" },
    ],
  },
  {
    title: "Info",
    links: [
      { label: "Chi siamo", href: "/chi-siamo" },
      { label: "Termini e condizioni", href: "/legale/termini" },
      { label: "Privacy e cookie", href: "/legale/privacy" },
    ],
  },
];
