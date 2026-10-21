import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { createManagementServerClient } from "@/lib/supabase/server";
import {
  requireManagementPrincipal,
  managementMfaDestination,
  StaffAuthorizationError,
  toAssuranceLevel,
} from "@/lib/management/access";
import { MANAGEMENT_ORGANIZATION_COOKIE } from "@geardrop/data-contract";
import { ManagementShell } from "@/components/management-shell";

/**
 * Layout protetto: verifica staff, membership, livello MFA e organizzazione
 * corrente, poi avvolge i figli nella shell di navigazione.
 *
 * Ordine dei controlli:
 *   1. Cookie organizzazione letto e passato come preferenza (non come autorizzazione).
 *   2. Identità e membership attive, risolte dal database (mai da cookie/form/client).
 *   3. Livello AAL corrente e successivo dalla sessione Supabase.
 *   4. Macchina a stati MFA: owner senza fattore → /mfa/enroll;
 *      fattore registrato non ancora sfidato → /mfa/challenge.
 *   5. Figli avvolti nella ManagementShell con dati serializzabili del principal.
 *
 * Non importa nulla da src/ root né dagli helper Supabase root.
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const client = await createManagementServerClient();

  // 0. Preferenza organizzazione dal cookie (solo una preferenza, validata al passo 1).
  const cookieStore = await cookies();
  const preferredSlug = cookieStore.get(MANAGEMENT_ORGANIZATION_COOKIE)?.value;

  // 1. Staff e membership: risolti server-side interrogando il database.
  //    Lo slug preferito viene validato contro le membership attive reali;
  //    uno slug non valido cade sul default deterministico senza errori.
  //    Credenziali errate, staff disattivato e membership assente producono
  //    lo stesso messaggio generico (non riveliamo quale dei tre).
  let principal;
  try {
    principal = await requireManagementPrincipal(client, preferredSlug);
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

  // 4. Avvolgi i figli nella shell di navigazione.
  //    Passare solo dati serializzabili: nessun oggetto Supabase o funzione server.
  return (
    <ManagementShell
      orgName={principal.organization.name}
      role={principal.role}
      organizations={principal.organizations}
      currentOrgId={principal.organization.id}
    >
      {children}
    </ManagementShell>
  );
}
