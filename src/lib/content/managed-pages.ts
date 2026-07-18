export const MANAGED_PAGE_SLUGS = [
  "chi-siamo", "assistenza", "faq", "spedizioni", "resi", "contatti", "privacy", "cookie", "termini",
] as const;

export type ManagedPageSlug = typeof MANAGED_PAGE_SLUGS[number];

export const MANAGED_PAGE_LABELS: Record<ManagedPageSlug, string> = {
  "chi-siamo": "Chi siamo",
  assistenza: "Assistenza",
  faq: "FAQ",
  spedizioni: "Spedizioni",
  resi: "Resi",
  contatti: "Contatti",
  privacy: "Privacy",
  cookie: "Cookie",
  termini: "Termini",
};

export function isManagedPageSlug(value: string): value is ManagedPageSlug {
  return MANAGED_PAGE_SLUGS.includes(value as ManagedPageSlug);
}
