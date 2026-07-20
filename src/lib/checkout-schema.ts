import { z } from "zod";
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
  notes: z.string().trim().max(300, "Massimo 300 caratteri.").optional(),
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
  contact: checkoutSchema,
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
