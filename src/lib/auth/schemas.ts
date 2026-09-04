import { z } from "zod";

/**
 * Auth payload shapes. Bounded lengths everywhere: these strings reach Supabase Auth and
 * the profile tables, and an unbounded field is an easy way to waste a request.
 */

const email = z
  .email({ message: "Inserisci un indirizzo email valido." })
  .trim()
  .max(254, "Email troppo lunga.")
  .transform((value) => value.toLowerCase());

const password = z
  .string()
  .min(8, "La password deve avere almeno 8 caratteri.")
  .max(72, "La password può avere al massimo 72 caratteri.");

const name = z.string().trim().max(80, "Massimo 80 caratteri.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Inserisci la password.").max(72),
});

export const registerSchema = z.object({
  email,
  password,
  firstName: name,
  lastName: name,
});

export const recoverSchema = z.object({ email });

export const updatePasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((value) => value.password === value.confirm, {
    message: "Le due password non coincidono.",
    path: ["confirm"],
  });

export const profileSchema = z.object({
  firstName: name,
  lastName: name,
  phone: z.string().trim().max(32, "Massimo 32 caratteri.").optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;

/** Shape every auth Server Action returns to `useActionState`. */
export type AuthFormState = {
  readonly error?: string;
  readonly notice?: string;
};

/** First validation message, or a generic fallback. Field-level detail is not needed here. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dati non validi.";
}
