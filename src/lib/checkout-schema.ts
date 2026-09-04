import { z } from "zod";

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
  shippingMethod: z.enum(["standard", "express"]),
  // One method only for now: PayPal.Me (see src/lib/payments.ts).
  paymentMethod: z.enum(["paypalme"]),
  notes: z.string().trim().max(300, "Massimo 300 caratteri.").optional(),
});

export type CheckoutValues = z.infer<typeof checkoutSchema>;

export const SHIPPING_METHODS = [
  { value: "standard", label: "Standard", hint: "Consegna in 24/48h", surcharge: 0 },
  { value: "express", label: "Express", hint: "Consegna il giorno successivo", surcharge: 690 },
] as const;

export const PAYMENT_METHODS = [{ value: "paypalme", label: "PayPal.Me" }] as const;
