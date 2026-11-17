import type { TrackingEvent } from "./inpost";

/**
 * Reading InPost tracking events (https://developers.inpost-group.com/tracking-events, V1).
 * The codes are the same in the Tracking API and in the Shipment.Tracking webhook.
 */

/** The parcel reached the buyer: picked up from the Locker, or handed over at an address. */
const DELIVERED = new Set(["EOL.1001", "EOL.1002", "EOL.1003", "EOL.1004", "EOL.1005"]);

/** The parcel will not reach the buyer: it is coming back, or it is lost for good. */
const FAILED = new Set(["RTS.1001", "LMD.9014", "EOL.9001", "EOL.9002", "EOL.9003", "EOL.9004"]);

/** What the owner reads in the admin, by event code. */
const LABELS: Readonly<Record<string, string>> = {
  "CRE.1001": "Spedizione creata",
  "FMD.1001": "In attesa del ritiro da parte di InPost",
  "FMD.1002": "Presa in carico da InPost",
  "MMD.1001": "Arrivata al centro di smistamento",
  "MMD.1002": "Lavorata al centro di smistamento",
  "MMD.1003": "Partita dal centro di smistamento",
  "MMD.1004": "In viaggio",
  "LMD.1001": "In consegna",
  "LMD.1002": "Arrivata a destinazione",
  "LMD.1003": "Pronta per il ritiro",
  "LMD.1004": "Pronta per il ritiro al punto",
  "LMD.1005": "Pronta per il ritiro nel Locker",
  "LMD.3001": "Spostata in un altro punto di ritiro",
  "LMD.3014": "Spostata dal cliente in un altro Locker",
  "LMD.9001": "Promemoria: da ritirare",
  "LMD.9002": "Non ritirata in tempo",
  "LMD.9003": "Troppo grande per il Locker",
  "LMD.9012": "Messa in deposito temporaneo nel Locker",
  "LMD.9014": "Non ritirata: torna al mittente",
  "EOL.1001": "Consegnata",
  "EOL.1002": "Ritirata dal cliente",
  "EOL.9001": "Smarrita",
  "EOL.9002": "Danneggiata",
  "EOL.9003": "Distrutta",
  "EOL.9004": "Annullata",
  "RTS.1001": "In ritorno al mittente",
  "INF.9001": "Ritardo nella consegna",
};

export function eventLabel(code: string): string {
  return LABELS[code] ?? `Aggiornamento InPost (${code})`;
}

export type ParcelOutcome =
  | { readonly kind: "delivered"; readonly code: string; readonly at: string }
  | { readonly kind: "failed"; readonly code: string; readonly at: string }
  | { readonly kind: "moving" };

/**
 * Where the parcel stands from its events. Only the latest delivery or failure counts: a parcel
 * can be cancelled and then sent after all, so an old EOL.9004 says nothing once it moved again.
 */
export function parcelOutcome(events: readonly TrackingEvent[]): ParcelOutcome {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const event = sorted[index]!;
    if (DELIVERED.has(event.code)) return { kind: "delivered", code: event.code, at: event.at };
    if (FAILED.has(event.code)) return { kind: "failed", code: event.code, at: event.at };
    // A later move cancels an earlier ending.
    if (/^(FMD|MMD|LMD)\.1/.test(event.code)) return { kind: "moving" };
  }
  return { kind: "moving" };
}

export function isDeliveryEvent(code: string): boolean {
  return DELIVERED.has(code);
}
