import type { PaidCheckout } from "@/lib/orders/stripe-order";
import type { Preorder } from "./preorders";

/**
 * A Telegram pre-order paid with PayPal.me, seen as the paid checkout the order emails are written
 * from (owner, 2026-11-27: the PayPal.me pre-orders become real orders of the shop). The figures are
 * the ones the bot showed and the buyer paid; the parcel goes to the Locker he chose in the chat.
 */
export function paidCheckoutFromPreorder(preorder: Preorder, orderNumber: string, now: Date): PaidCheckout {
  return {
    sessionId: "",
    paymentIntentId: null,
    reference: orderNumber,
    email: preorder.email ?? "",
    phone: preorder.phone,
    shipping: {
      name: preorder.buyerName ?? "",
      address: "",
      postalCode: "",
      city: "",
      province: "",
      country: "IT",
      method: "inpost-locker",
      methodLabel: "InPost · Locker",
      ...(preorder.locker ? { pickupPoint: preorder.locker.label, pickupPointId: preorder.locker.id } : {}),
    },
    notes: null,
    lines: [{ slug: preorder.slug, name: preorder.productName, quantity: preorder.quantity, unitPriceCents: preorder.unitCents }],
    shippingCents: preorder.shippingCents,
    discountCents: 0,
    couponCode: null,
    totalCents: preorder.totalCents,
    createdAt: now.toISOString(),
  };
}
