/**
 * When saving a shipment emails the buyer.
 *
 * The owner asked (2026-10-06) that a tracking code reach the customer the moment it is entered
 * in the panel, so buyers stop writing to ask where their parcel is. There is no opt-out on the
 * shipping card any more: the email goes the first time the order ships, and again whenever the
 * carrier, the code or the link changes, because a buyer holding a wrong code is the same buyer
 * writing in. The one save that sends nothing is a repeat of exactly what the buyer already has.
 */

export type ShipmentTracking = {
  readonly carrier: string | null;
  readonly code: string | null;
  readonly url: string | null;
};

const value = (text: string | null | undefined) => text?.trim() || null;

export function shippingEmailDue(
  saved: ShipmentTracking & { readonly notifiedAt: string | null },
  next: ShipmentTracking,
): boolean {
  if (!saved.notifiedAt) return true;
  return (
    value(saved.carrier) !== value(next.carrier) ||
    value(saved.code) !== value(next.code) ||
    value(saved.url) !== value(next.url)
  );
}
