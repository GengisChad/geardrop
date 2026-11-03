import type { TrackingEvent } from "@/lib/shipping/inpost";
import { eventLabel, parcelOutcome } from "@/lib/shipping/inpost-tracking";
import { carrierByLabel } from "./carriers";

/**
 * How an order reads to its buyer, on the account page and on the public lookup (/ordine).
 * Pure, so the lookup's client form and the server-rendered account page share it.
 */

export const ORDER_STATUS_LABEL: Readonly<Record<string, string>> = {
  pending: "In attesa",
  confirmed: "Confermato",
  processing: "In lavorazione",
  shipped: "Spedito",
  // An order closes when the parcel reaches the buyer: the Locker pickup, or the owner's
  // "Conferma consegna" for a parcel handed over.
  completed: "Consegnato",
  cancelled: "Annullato",
};

/** The steps an order walks through, in order. A cancelled order walks none. */
export const ORDER_STEPS = ["confirmed", "processing", "shipped", "completed"] as const;

/** How far the order got: its step's index in ORDER_STEPS, -1 when it walks none. */
export function orderStepIndex(status: string): number {
  return ORDER_STEPS.indexOf(status as (typeof ORDER_STEPS)[number]);
}

/** When InPost reports the parcel collected. InPost knows first: the order closes on the next tracking run. */
export function parcelDeliveredAt(events: readonly TrackingEvent[] | null): string | null {
  const outcome = events ? parcelOutcome(events) : null;
  return outcome?.kind === "delivered" ? outcome.at : null;
}

/** How far the order got, counting a parcel InPost already reports as collected. */
export function orderProgress(status: string, events: readonly TrackingEvent[] | null): number {
  return parcelDeliveredAt(events) ? ORDER_STEPS.indexOf("completed") : orderStepIndex(status);
}

/** Events that mean the parcel is waiting for the buyer, at a Locker or a pickup point. */
const WAITING_FOR_BUYER = new Set(["LMD.1003", "LMD.1004", "LMD.1005", "LMD.9001", "LMD.9012"]);

export type ParcelUpdate = {
  readonly code: string;
  readonly label: string;
  readonly place: string | null;
  readonly at: string;
  /** The parcel is waiting to be collected: the one update the buyer has to act on. */
  readonly readyForPickup: boolean;
};

/** A parcel's journey as the buyer reads it: newest first, each event in words. */
export function parcelJourney(events: readonly TrackingEvent[]): readonly ParcelUpdate[] {
  return [...events]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((event) => ({
      code: event.code,
      label: eventLabel(event.code),
      place: event.place,
      at: event.at,
      readyForPickup: WAITING_FOR_BUYER.has(event.code),
    }));
}

/** Just what deciding whose parcel InPost is asked about needs. */
export type TrackableOrder = {
  readonly status: string;
  readonly trackingCarrier: string | null;
  readonly trackingCode: string | null;
};

/**
 * The InPost tracking numbers worth asking InPost about: parcels still travelling. A delivered
 * order already says so, and other couriers have no API here, so those buyers follow the link.
 */
export function liveTrackingCodes(orders: readonly TrackableOrder[]): readonly string[] {
  const codes = orders.flatMap((order) =>
    order.status === "shipped" && carrierByLabel(order.trackingCarrier)?.id === "inpost" && order.trackingCode?.trim()
      ? [order.trackingCode.trim()]
      : [],
  );
  return [...new Set(codes)].sort();
}
