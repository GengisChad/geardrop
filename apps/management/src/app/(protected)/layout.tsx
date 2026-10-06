import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createManagementServerClient } from "@/lib/supabase/server";
import {
  requireManagementPrincipal,
  managementMfaDestination,
  StaffAuthorizationError,
  toAssuranceLevel,
} from "@/lib/management/access";

/**
 * Layout protetto: verifica staff, membership e livello MFA lato server.
 * Nessun figlio viene renderizzato se il controllo non passa.
 *
 * Ordine dei controlli:
 *   1. Identità e membership attive, risolte dal database (mai da cookie/form/client).
 *   2. Livello AAL corrente e successivo dalla sessione Supabase.
 *   3. Macchina a stati MFA: owner senza fattore → /mfa/enroll;
 *      fattore registrato non ancora sfidato → /mfa/challenge.
 *
 * Non importa nulla da src/ root né dagli helper Supabase root.
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const client = await createManagementServerClient();

  // 1. Staff e membership: risolti server-side interrogando il database.
  //    Credenziali errate, staff disattivato e membership assente producono
  //    lo stesso messaggio generico (non riveliamo quale dei tre).
  let principal;
  try {
    principal = await requireManagementPrincipal(client);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      redirect("/login");
    }
    throw error;
  }

  // 2. Livello MFA: sempre dal server, non da cookie o dati client.
  const { data: aalData, error: aalError } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalError || !aalData) {
    redirect("/login");
  }

  // 3. Decisione MFA: enrollment o challenge obbligatori prima di qualunque figlio.
  //    Livello sconosciuto (null) → accesso negato.
  let mfaDest: "/mfa/enroll" | "/mfa/challenge" | null = null;
  try {
    mfaDest = managementMfaDestination(
      principal.role,
      toAssuranceLevel(aalData.currentLevel),
      toAssuranceLevel(aalData.nextLevel),
    );
  } catch {
    redirect("/login");
  }

  if (mfaDest !== null) {
    redirect(mfaDest);
  }

  return <>{children}</>;
}
