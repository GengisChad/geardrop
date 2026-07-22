import { z } from "zod";

export type AuthFormState = {
  readonly error: string | null;
  readonly notice: string | null;
};

/**
 * Lives here rather than beside the actions: a "use server" module may only export async
 * functions, so the initial state for useActionState has to come from a plain module.
 */
export const EMPTY_AUTH_STATE: AuthFormState = { error: null, notice: null };

/**
 * Supabase enforces its own minimum (currently 6). Asking for 8 here is a deliberate
 * tightening at the edge: the project setting can be raised later without this form
 * having accepted weaker passwords in the meantime.
 */
export const PASSWORD_MIN_LENGTH = 8;

const email = z.string().trim().toLowerCase().pipe(z.email());
const password = z.string().min(PASSWORD_MIN_LENGTH).max(1024);

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(1024),
});

export const registerSchema = z.object({
  email,
  password,
  displayName: z.string().trim().min(2).max(80).optional().or(z.literal("")),
});

export const recoverSchema = z.object({ email });

export const newPasswordSchema = z
  .object({
    password,
    passwordConfirm: z.string().min(1).max(1024),
  })
  .refine((value) => value.password === value.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "Le password non coincidono.",
  });

export const profileSchema = z.object({
  displayName: z.string().trim().max(80),
  phone: z.string().trim().max(32),
});
