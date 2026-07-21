"use server";

import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  type AuthFormState,
  loginSchema,
  newPasswordSchema,
  profileSchema,
  recoverSchema,
  registerSchema,
} from "@/lib/auth/customer-schemas";
import { authRedirectUrl, safeRedirectPath } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * One message for every failure mode of sign-in. Distinguishing "unknown email" from
 * "wrong password" would turn the form into an account-existence oracle.
 */
const SAFE_LOGIN_ERROR = "Email o password non corretti.";

/**
 * Sign-up and password recovery always report success, whether or not the address is
 * already registered. Supabase sends the appropriate email either way, so the honest
 * user is unaffected and an attacker learns nothing.
 */
const SIGNUP_NOTICE =
  "Ti abbiamo inviato un'email di conferma. Apri il link per attivare l'account.";
const RECOVER_NOTICE =
  "Se l'indirizzo è registrato, riceverai un'email con il link per reimpostare la password.";

async function requestOrigin(): Promise<string | null> {
  const headerList = await headers();
  return headerList.get("origin") ?? null;
}

export async function loginAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Inserisci email e password.", notice: null };
  }

  const client = await createSupabaseServerClient();
  const { error } = await client.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: SAFE_LOGIN_ERROR, notice: null };
  }

  redirect(safeRedirectPath(formData.get("next")?.toString()) as Route);
}

export async function registerAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });

  if (!parsed.success) {
    return {
      error: "Controlla i campi: serve un'email valida e una password di almeno 8 caratteri.",
      notice: null,
    };
  }

  const client = await createSupabaseServerClient();
  const origin = await requestOrigin();
  const displayName = parsed.data.displayName?.trim();

  // Open sign-up creates customers only. The role a visitor could try to smuggle in here
  // would land in user_metadata, which no authorization path reads: staff comes from
  // staff_profiles, writable only by an owner through a security-definer RPC.
  const { error } = await client.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: authRedirectUrl(origin, "/auth/callback?next=/account"),
      ...(displayName ? { data: { display_name: displayName } } : {}),
    },
  });

  if (error) {
    // Rate limiting is the one failure worth naming: retrying immediately would fail too.
    if (error.status === 429) {
      return { error: "Troppi tentativi. Riprova tra qualche minuto.", notice: null };
    }

    return { error: null, notice: SIGNUP_NOTICE };
  }

  return { error: null, notice: SIGNUP_NOTICE };
}

export async function recoverAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = recoverSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { error: "Inserisci un indirizzo email valido.", notice: null };
  }

  const client = await createSupabaseServerClient();
  const origin = await requestOrigin();

  await client.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: authRedirectUrl(origin, "/auth/callback?next=/nuova-password"),
  });

  return { error: null, notice: RECOVER_NOTICE };
}

export async function newPasswordAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });

  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((issue) => issue.path.includes("passwordConfirm"));

    return {
      error: mismatch
        ? "Le password non coincidono."
        : "La password deve avere almeno 8 caratteri.",
      notice: null,
    };
  }

  const client = await createSupabaseServerClient();
  const { data: claims } = await client.auth.getClaims();

  // The recovery link is what authenticates this form; without a live session there is
  // nothing to update and the visitor has to start recovery again.
  if (!claims?.claims.sub) {
    return {
      error: "Link scaduto o non valido. Richiedi un nuovo link di recupero.",
      notice: null,
    };
  }

  const { error } = await client.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { error: "Non è stato possibile aggiornare la password. Riprova.", notice: null };
  }

  redirect("/account");
}

export async function logoutAction(): Promise<void> {
  const client = await createSupabaseServerClient();
  await client.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateProfileAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return { error: "Controlla i dati inseriti.", notice: null };
  }

  const client = await createSupabaseServerClient();
  const { data: claims } = await client.auth.getClaims();
  const userId = claims?.claims.sub;

  if (!userId) {
    return { error: "Sessione scaduta. Accedi di nuovo.", notice: null };
  }

  // RLS pins the row to the caller: customer_profiles_own_insert and _own_update both
  // require user_id = auth.uid(), so this cannot touch anyone else's profile.
  const { error } = await client.from("customer_profiles").upsert(
    {
      user_id: userId,
      display_name: parsed.data.displayName || null,
      phone: parsed.data.phone || null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return { error: "Non è stato possibile salvare il profilo.", notice: null };
  }

  revalidatePath("/account");

  return { error: null, notice: "Profilo aggiornato." };
}
