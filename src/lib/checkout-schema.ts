import { z } from "zod";
import { visitSourceSchema } from "@/lib/attribution";
import { shippingMethodByCode } from "@/data/catalog";
import { MAX_QUANTITY_PER_LINE } from "@/lib/commerce/limits";

/** Italian postal codes are exactly five digits. */
const cap = z
  .string()
  .trim()
  .regex(/^\d{5}$/, "Il CAP deve essere di 5 cifre.");

/** Accepts +39 prefixes, spaces and dots; requires 8-13 digits. */
const phone = z
  .string()
  .trim()
  .refine((value) => /^[+]?[\d\s.()-]{8,20}$/.test(value) && value.replace(/\D/g, "").length >= 8, {
    message: "Inserisci un numero di telefono valido.",
  });

/**
 * Shipping codes are not an enum here on purpose. The set of options is whatever the
 * backend currently sells, so this only checks the shape; the authority is the quote
 * the server returns, and ultimately `calculate_cart_pricing`, which refuses any code
 * that is not an active method.
 */
const shippingCode = z
  .string()
  .trim()
  .min(1, "Scegli un metodo di spedizione.")
  .max(64)
  .regex(/^[a-z0-9-]+$/, "Metodo di spedizione non valido.");

/** An InPost point id as the Location API returns it: country, underscore, point name. */
export const inpostPointId = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}_[A-Z0-9]{3,40}$/, "Locker non valido.");

export const checkoutSchema = z.object({
  email: z.email({ message: "Inserisci un indirizzo email valido." }),
  firstName: z.string().trim().min(2, "Inserisci il nome."),
  lastName: z.string().trim().min(2, "Inserisci il cognome."),
  address: z.string().trim().min(5, "Inserisci l'indirizzo."),
  city: z.string().trim().min(2, "Inserisci la città."),
  postalCode: cap,
  province: z
    .string()
    .trim()
    .length(2, "Usa la sigla di 2 lettere (es. MI).")
    .transform((value) => value.toUpperCase()),
  phone,
  shippingMethod: shippingCode,
  /** The InPost point or Locker the parcel goes to, when the buyer picked one. */
  pickupPoint: z.string().trim().max(160, "Massimo 160 caratteri.").optional(),
  /** InPost's own id of the Locker picked from the search ("IT_ITROM44128M"): what the label is made out to. */
  pickupPointId: inpostPointId.optional(),
  notes: z.string().trim().max(300, "Massimo 300 caratteri.").optional(),
});

// One message for every pickup method: the InPost Locker (the shop's only pickup since 2026-10-23)
// and the partner's Punto Poste. The Locker is named because it is what most buyers pick.
export const PICKUP_POINT_MESSAGE = "Indica il Locker o il punto dove ritirare il pacco.";

/**
 * Label and example for the pickup field, naming the choice the buyer picked: the InPost Locker
 * (since 2026-10-13) or the partner's Punto Poste. The other branches only serve orders placed with
 * the retired inpost-point and poste-point.
 */
export function pickupPointCopy(method: { readonly code: string; readonly carrier: string } | undefined): {
  readonly label: string;
  readonly placeholder: string;
} {
  if (method?.carrier === "poste") return { label: "Punto di ritiro Poste Italiane", placeholder: "Es. nome o indirizzo del punto" };
  if (method?.code === "inpost-locker") return { label: "Locker InPost", placeholder: "Es. codice o indirizzo del Locker" };
  return { label: "Punto di ritiro InPost", placeholder: "Es. nome o indirizzo del punto" };
}

/** A pickup method needs the point it delivers to: three characters at least (a Locker code). */
export function pickupPointMissing(shippingMethod: string | undefined, pickupPoint: string | undefined): boolean {
  return Boolean(shippingMethodByCode(shippingMethod)?.pickupPoint) && (pickupPoint ?? "").trim().length < 3;
}

/** The whole form, with the rule that ties two of its fields together. */
export const checkoutFormSchema = checkoutSchema.superRefine((values, context) => {
  if (pickupPointMissing(values.shippingMethod, values.pickupPoint)) {
    context.addIssue({ code: "custom", path: ["pickupPoint"], message: PICKUP_POINT_MESSAGE });
  }
});

export type CheckoutValues = z.infer<typeof checkoutSchema>;

/**
 * What the browser is allowed to send when placing an order.
 *
 * Note what is absent: no unit price, no subtotal, no discount, no shipping cost, no
 * total, and no customer id. Money is recomputed by the database from the catalogue,
 * and the buyer is read from the session, so nothing here can move either.
 */
export const placeOrderSchema = z.object({
  contact: checkoutFormSchema,
  lines: z
    .array(
      z.object({
        slug: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .regex(/^[a-z0-9-]+$/, "Riga carrello non valida."),
        quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
      }),
    )
    .min(1, "Il carrello è vuoto.")
    .max(50, "Il carrello contiene troppe righe."),
  couponCode: z.string().trim().max(80).optional(),
  /** Stable for the life of one checkout attempt, so a retry cannot double-order. */
  idempotencyKey: z.uuid(),
  /** Channel of the visit (see lib/attribution). Dropped, never rejected, when malformed. */
  attribution: visitSourceSchema,
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const cartQuoteSchema = z.object({
  lines: z
    .array(
      z.object({
        slug: z.string().trim().min(1).max(120),
        quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
      }),
    )
    .max(50),
  shippingCode: shippingCode.optional(),
  couponCode: z.string().trim().max(80).optional(),
});

export type CartQuoteInput = z.infer<typeof cartQuoteSchema>;

/**
 * What the browser sends to start an express Stripe Checkout (no contact form).
 * The buyer's address and phone are collected by Stripe on its hosted page.
 *
 * Reuses the same line and key shapes as placeOrderSchema so the server-side
 * validation is identical: no unit price, no personal data until Stripe has it.
 */
export const expressCheckoutSchema = z.object({
  lines: placeOrderSchema.shape.lines,
  /** Fresh UUID per attempt: prevents double-redirects on accidental double-taps. */
  idempotencyKey: placeOrderSchema.shape.idempotencyKey,
  attribution: visitSourceSchema,
  /** The Locker picked in the cart: Stripe cannot ask for one (owner, 2026-10-23). */
  pickupPoint: checkoutSchema.shape.pickupPoint,
  pickupPointId: checkoutSchema.shape.pickupPointId,
});

export type ExpressCheckoutInput = z.infer<typeof expressCheckoutSchema>;
