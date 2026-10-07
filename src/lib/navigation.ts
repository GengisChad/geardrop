import { FREE_SHIPPING_FROM_LABEL } from "@/lib/labels";
import type { AppHref } from "@/lib/routes";

export type NavItem = {
  readonly label: string;
  readonly href: AppHref;
  /** Lime = the promotional entry ("OFFERTE"); violet = the fresh one ("NUOVI ARRIVI"). */
  readonly tone?: "violet" | "lime";
};

/**
 * Builds the header nav with optional brand entries.
 *
 * "Hasbro" always appears after "Negozio". "Takara Tomy" is added only when the
 * catalogue has at least one Takara Tomy product — pass `hasTakara: true` then.
 */
export function buildMainNav({ hasTakara = false }: { hasTakara?: boolean } = {}): readonly NavItem[] {
  // The header holds eight entries at laptop widths. The two brands lead; with Takara Tomy on sale
  // it takes the fresh slot ("Nuovi arrivi"), and the tops stay one click away under Negozio.
  return [
    { label: "Negozio", href: "/negozio" },
    { label: "Hasbro", href: "/negozio/hasbro" },
    ...(hasTakara ? [{ label: "Takara Tomy", href: "/negozio/takara-tomy" as AppHref, tone: "violet" as const }] : []),
    { label: "Lanciatori", href: "/negozio/lanciatori" },
    { label: "Stadi", href: "/negozio/stadi" },
    { label: "Accessori", href: "/negozio/accessori" },
    { label: "Meta", href: "/meta" },
    ...(hasTakara ? [] : [{ label: "Nuovi arrivi", href: "/negozio?sort=novita" as AppHref, tone: "violet" as const }]),
    { label: "Offerte", href: "/prodotto/duo-horus-enlil", tone: "lime" },
  ];
}

/**
 * Static nav used when no catalogue context is available (content seed, Supabase nav builder).
 * Includes Hasbro but not Takara Tomy (no products in the current catalogue).
 */
export const MAIN_NAV: readonly NavItem[] = buildMainNav();

/**
 * The row under the footer columns. The shop's own account comes first; the channel is
 * where the catalogue is actually explained, so it earns its place beside it.
 */
export const SOCIAL_LINKS: readonly { readonly key: string; readonly label: string; readonly href: string }[] = [
  { key: "instagram", label: "Instagram", href: "https://www.instagram.com/geardropshop/" },
  { key: "youtube", label: "YouTube", href: "https://www.youtube.com/@GengisChadBBX" },
];

export const ANNOUNCEMENTS = [
  { icon: "package", text: `Spedizione gratuita sopra ${FREE_SHIPPING_FROM_LABEL}` },
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
      { label: "Meta attuale", href: "/meta" },
      { label: "Nuovi arrivi", href: "/negozio?sort=novita" },
    ],
  },
  {
    title: "Aiuto",
    links: [
      { label: "FAQ", href: "/assistenza/faq" },
      { label: "Spedizioni", href: "/assistenza/spedizioni" },
      { label: "Resi e rimborsi", href: "/assistenza/resi" },
      { label: "Traccia il tuo ordine", href: "/ordine" },
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
