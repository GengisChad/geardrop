"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { appRoute } from "@/lib/routes";
import {
  firstIssue,
  loginSchema,
  recoverSchema,
  registerSchema,
  updatePasswordSchema,
  type AuthFormState,
} from "@/lib/auth/schemas";

const NOT_CONFIGURED = "Accesso non disponibile: il backend non è configurato.";

/**
 * Login and registration deliberately share one vague failure string. Distinguishing
 * "email sconosciuta" from "password errata" turns the form into an account-enumeration
 * oracle (design §10).
 */
const GENERIC_CREDENTIALS = "Email o password non validi.";

/** Absolute origin for Supabase email links, taken from the current request. */
async function origin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Keeps a post-login redirect on this site: an absolute URL here would be an open redirect. */
function safeRedirect(value: FormDataEntryValue | null): string {
  const target = typeof value === "string" ? value : "";
  return target.startsWith("/") && !target.startsWith("//") ? target : "/account";
}

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: GENERIC_CREDENTIALS };

  redirect(appRoute(safeRedirect(formData.get("redirect"))));
}

export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };

  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${await origin()}/auth/confirm?next=/account`,
      // Names are a convenience only: they are copied into customer_profiles on the first
      // authenticated visit. No metadata field can ever grant a role — staff membership
      // lives in staff_profiles and is assigned by an owner.
      data: { first_name: parsed.data.firstName, last_name: parsed.data.lastName },
    },
  });

  // The same confirmation notice is returned whether or not the address already exists.
  if (error && error.status !== 422) return { error: "Registrazione non riuscita. Riprova più tardi." };

  return { notice: "Ti abbiamo inviato un'email di conferma. Apri il link per attivare l'account." };
}

export async function logoutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function recoverAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };

  const parsed = recoverSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await origin()}/auth/confirm?next=/auth/nuova-password`,
  });

  // Always the same answer, registered or not.
  return { notice: "Se l'indirizzo è registrato, riceverai un'email con il link di reimpostazione." };
}

export async function updatePasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };

  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Sessione scaduta. Richiedi un nuovo link di reimpostazione." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Non è stato possibile aggiornare la password. Riprova." };

  redirect("/account");
}
