"use server";
/**
 * Server action per il control-plane dei feature flag gestionali.
 *
 * SICUREZZA:
 * – Principal, ruolo e AAL vengono sempre riletti dal server in questa action.
 *   Nessun parametro del form determina l'identità dell'attore o l'organizzazione.
 * – Il confronto organizationId viene eseguito contro principal.organization.id:
 *   un form che invia un id diverso viene rifiutato con UNAUTHORIZED.
 * – L'unico flag modificabile in questa fase è read_access.
 *   Tutti gli altri (inventory_writes, purchasing_writes, ecc.) non hanno setter
 *   ed il database li rifiuta da solo, ma qui non vengono nemmeno tentati.
 * – Il conflitto di versione (timestamp cambiato da un altro utente) viene
 *   restituito come code "CONFLICT" con messaggio distinguibile.
 *
 * Nessuna dipendenza dalla root (src/...). Solo package workspace e file propri.
 */

import { cookies } from "next/headers";
import {
  MANAGEMENT_ORGANIZATION_COOKIE,
  requireManagementPrincipal,
  StaffAuthorizationError,
} from "@geardrop/data-contract";
import { toAssuranceLevel } from "../../lib/management/access";
import { createManagementServerClient } from "../../lib/supabase/server";

// ---------------------------------------------------------------------------
// Tipo di risultato (discriminato, non mai lancia al chiamante)
// ---------------------------------------------------------------------------

export type SetReadAccessResult =
  | { readonly success: true }
  | {
      readonly success: false;
      readonly code:
        | "UNAUTHORIZED"
        | "CONFLICT"
        | "INVALID_INPUT"
        | "UNAVAILABLE";
    };

// ---------------------------------------------------------------------------
// Azione control-plane
// ---------------------------------------------------------------------------

/**
 * Cambia lo stato di read_access per l'organizzazione corrente del principal.
 *
 * @param organizationId  ID dell'organizzazione su cui l'utente sta operando
 *                        (viene validato contro la membership reale del principal).
 * @param enabled         Nuovo valore del flag.
 * @param expectedUpdatedAt  Timestamp letto nella visualizzazione corrente
 *                        (optimistic concurrency: se nel frattempo qualcun altro
 *                         ha già modificato il flag, il database risponde con un
 *                         conflitto).
 * @param reason          Motivazione obbligatoria (3–500 caratteri).
 */
export async function setReadAccess(
  organizationId: number,
  enabled: boolean,
  expectedUpdatedAt: string,
  reason: string,
): Promise<SetReadAccessResult> {
  // 1. Client Supabase posseduto dall'app management.
  const client = await createManagementServerClient();

  // 2. Slug preferito dal cookie (viene validato, non autorizza).
  const cookieStore = await cookies();
  const slug = cookieStore.get(MANAGEMENT_ORGANIZATION_COOKIE)?.value;

  // 3. Principal riletto dal database: ruolo, membership e azienda vengono
  //    dal DB, mai dal form o da cookie non validati.
  let principal;
  try {
    principal = await requireManagementPrincipal(client, slug);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return { success: false, code: "UNAUTHORIZED" };
    }
    throw error;
  }

  // 4. Verifica owner + AAL2 server-side.
  const { data: aalData, error: aalError } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || !aalData) {
    return { success: false, code: "UNAUTHORIZED" };
  }

  if (
    principal.role !== "owner" ||
    toAssuranceLevel(aalData.currentLevel) !== "aal2"
  ) {
    return { success: false, code: "UNAUTHORIZED" };
  }

  // 5. Verifica che l'organizzazione inviata dal form coincida con quella reale
  //    del principal (difesa contro form manomessi).
  if (principal.organization.id !== organizationId) {
    return { success: false, code: "UNAUTHORIZED" };
  }

  // 6. Validazione input base (il database fa la validazione definitiva, ma
  //    restituire INVALID_INPUT qui permette un messaggio più preciso all'utente).
  if (
    typeof enabled !== "boolean" ||
    !expectedUpdatedAt ||
    typeof reason !== "string" ||
    reason.trim().length < 3 ||
    reason.trim().length > 500
  ) {
    return { success: false, code: "INVALID_INPUT" };
  }

  // 7. Chiama il RPC direttamente per poter distinguere il conflitto di versione
  //    dall'indisponibilità generica — setManagementReadAccess del package
  //    avvolge tutto come ManagementFeatureUnavailableError e perderebbe la
  //    distinzione.
  const { data, error } = await client
    .schema("management_api")
    .rpc("set_management_read_access", {
      p_organization_id: organizationId,
      p_enabled: enabled,
      p_expected_updated_at: expectedUpdatedAt,
      p_reason: reason.trim(),
    });

  if (error) {
    // Il database segnala conflitto ottimistico con messaggio stabile.
    if (
      error.message === "GD_MANAGEMENT_FEATURE_CONFLICT" ||
      error.code === "PT409"
    ) {
      return { success: false, code: "CONFLICT" };
    }
    return { success: false, code: "UNAVAILABLE" };
  }

  if (
    !data ||
    (data as { feature?: string }).feature !== "read_access" ||
    (data as { organization_id?: number }).organization_id !== organizationId ||
    (data as { enabled?: boolean }).enabled !== enabled
  ) {
    return { success: false, code: "UNAVAILABLE" };
  }

  return { success: true };
}
