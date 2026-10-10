"use server";

/**
 * Server Action per il login del gestionale.
 * Vincoli di sicurezza:
 * - Nessun import da src/ root né helper Supabase root.
 * - Il client viene sempre da createManagementServerClient().
 * - Credenziali errate, staff inattivo e membership assente → stesso messaggio generico.
 * - Nessun link di registrazione o recupero self-service che aggiri l'MFA.
 * - Il ruolo e l'AAL sono sempre risolti lato server, mai da cookie/metadata/form.
 */

import { redirect } from "next/navigation";
import { createManagementServerClient } from "@/lib/supabase/server";
import {
  managementMfaDestination,
  requireManagementPrincipal,
  StaffAuthorizationError,
  toAssuranceLevel,
} from "@/lib/management/access";
import type { MfaDestination } from "@/lib/management/access";

export type LoginState = {
  readonly error: string | null;
};

/** Messaggio generico identico per credenziali errate, staff inattivo e membership assente. */
const GENERIC_ERROR = "Credenziali o accesso non validi.";

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = ((formData.get("email") as string | null) ?? "").trim();
  const password = (formData.get("password") as string | null) ?? "";

  if (!email || !password) {
    return { error: GENERIC_ERROR };
  }

  const client = await createManagementServerClient();

  // 1. Autenticazione con password.
  //    Credenziali errate → stesso messaggio generico; non rivela la causa.
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    return { error: GENERIC_ERROR };
  }

  // La destinazione MFA viene calcolata nel try; se tutto va bene si chiama redirect fuori.
  let destination: MfaDestination = null;

  try {
    // 2. Verifica staff attivo e membership attiva (lato server, mai da form/cookie/metadata).
    const principal = await requireManagementPrincipal(client);

    // 3. Livello di assurance MFA effettivo della sessione appena creata.
    const { data: aalData, error: aalError } =
      await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError || !aalData) {
      await client.auth.signOut();
      return { error: GENERIC_ERROR };
    }

    // 4. Macchina a stati MFA: enrollment, challenge o null (può proseguire).
    try {
      destination = managementMfaDestination(
        principal.role,
        toAssuranceLevel(aalData.currentLevel),
        toAssuranceLevel(aalData.nextLevel),
      );
    } catch {
      // AAL sconosciuto o stato non valido.
      await client.auth.signOut();
      return { error: GENERIC_ERROR };
    }
  } catch (err) {
    if (err instanceof StaffAuthorizationError) {
      // Staff inattivo o membership assente → stesso messaggio generico.
      await client.auth.signOut();
      return { error: GENERIC_ERROR };
    }
    // Re-throw per NEXT_REDIRECT (redirect interno) e altri errori imprevisti.
    throw err;
  }

  // 5. Redirect verso route gestionale sicura (solo path management).
  redirect(destination ?? "/");
}
