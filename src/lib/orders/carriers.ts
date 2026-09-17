/**
 * Couriers the shop ships with and where a buyer follows a parcel. The link is built from the
 * tracking code, so the owner only types the code; "Altro" keeps whatever link is pasted, or none.
 */

export type Carrier = {
  readonly id: string;
  readonly label: string;
  readonly trackingUrl: ((code: string) => string) | null;
};

const encode = (code: string) => encodeURIComponent(code.trim());

export const CARRIERS: readonly Carrier[] = [
  { id: "poste", label: "Poste Italiane", trackingUrl: (code) => `https://www.poste.it/cerca/index.html#/risultati-spedizioni/${encode(code)}` },
  { id: "sda", label: "SDA", trackingUrl: (code) => `https://www.sda.it/wps/portal/Servizi_online/dettaglio-spedizione?locale=it&tracing.letteraVettura=${encode(code)}` },
  { id: "brt", label: "BRT", trackingUrl: (code) => `https://vas.brt.it/vas/sped_det_show.hsm?referer=sped_numspe_par.htm&Nspediz=${encode(code)}` },
  { id: "gls", label: "GLS", trackingUrl: (code) => `https://gls-group.com/IT/it/servizi-online/ricerca-spedizioni.html?match=${encode(code)}` },
  { id: "inpost", label: "InPost", trackingUrl: (code) => `https://inpost.it/trova-il-tuo-pacco?number=${encode(code)}` },
  { id: "dhl", label: "DHL", trackingUrl: (code) => `https://www.dhl.com/it-it/home/tracciamento.html?tracking-id=${encode(code)}` },
  { id: "ups", label: "UPS", trackingUrl: (code) => `https://www.ups.com/track?loc=it_IT&tracknum=${encode(code)}` },
  { id: "altro", label: "Altro", trackingUrl: null },
];

export function carrierById(id: string): Carrier | undefined {
  return CARRIERS.find((carrier) => carrier.id === id);
}

export function carrierByLabel(label: string | null | undefined): Carrier | undefined {
  const needle = label?.trim().toLowerCase();
  return needle ? CARRIERS.find((carrier) => carrier.label.toLowerCase() === needle) : undefined;
}

/** The link to show the buyer: the one pasted by the owner, else the carrier's own page for the code. */
export function trackingLink(carrierLabel: string | null | undefined, code: string | null | undefined, pastedUrl?: string | null): string | null {
  if (pastedUrl?.trim()) return pastedUrl.trim();
  const carrier = carrierByLabel(carrierLabel);
  return carrier?.trackingUrl && code?.trim() ? carrier.trackingUrl(code) : null;
}
