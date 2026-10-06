/**
 * Macchina a stati di accesso gestionale e guard del principal.
 * Non importa nulla da src/ root né dagli helper Supabase root.
 * Il client Supabase viene sempre da createManagementServerClient().
 */
import { StaffAuthorizationError } from "@geardrop/data-contract";
import type { StaffRole, AssuranceLevel } from "@geardrop/data-contract";

export type { AssuranceLevel, StaffPrincipal, StaffRole } from "@geardrop/data-contract";
export { requireManagementPrincipal, StaffAuthorizationError } from "@geardrop/data-contract";

/**
 * La destinazione MFA per questa sessione:
 * - "/mfa/enroll"    → nessun fattore registrato (solo owner)
 * - "/mfa/challenge" → fattore registrato ma non ancora verificato in sessione
 * - null             → può proseguire senza ulteriori step MFA
 */
export type MfaDestination = "/mfa/enroll" | "/mfa/challenge" | null;

/**
 * Supabase types the assurance level as an open string. Anything that is not a level this app
 * knows becomes null, which managementMfaDestination refuses: an unknown level denies access
 * instead of passing as if it were valid, which a type cast would have let it do.
 */
export function toAssuranceLevel(value: unknown): AssuranceLevel {
  return value === "aal1" || value === "aal2" ? value : null;
}

/**
 * Determina la destinazione MFA da imporre prima di rendere qualunque route protetta.
 * Lancia StaffAuthorizationError se i livelli di assurance sono null (AAL sconosciuto).
 *
 * Macchina a stati:
 *   owner  aal1→aal1  →  /mfa/enroll   (nessun fattore TOTP registrato)
 *   owner  aal1→aal2  →  /mfa/challenge (fattore registrato, sessione non ancora sfidato)
 *   owner  aal2→aal2  →  null           (prosegue)
 *   admin/editor  *→aal1  →  null       (nessun fattore, prosegue)
 *   admin/editor  aal1→aal2  →  /mfa/challenge
 *   admin/editor  aal2→*  →  null       (già completato)
 */
export function managementMfaDestination(
  role: StaffRole,
  currentLevel: AssuranceLevel,
  nextLevel: AssuranceLevel,
): MfaDestination {
  if (currentLevel === null || nextLevel === null) {
    throw new StaffAuthorizationError("AAL sconosciuto: accesso negato");
  }

  if (role === "owner") {
    // Owner richiede AAL2 obbligatoriamente.
    if (currentLevel === "aal2") return null;
    // currentLevel è aal1:
    if (nextLevel === "aal2") return "/mfa/challenge"; // fattore esiste, da sfidare
    return "/mfa/enroll"; // nessun fattore registrato
  }

  // admin / editor
  if (currentLevel === "aal2") return null; // già completato
  if (nextLevel === "aal1") return null; // nessun fattore registrato, non richiesto
  // nextLevel === "aal2" e currentLevel === "aal1": fattore registrato, sfida obbligatoria
  return "/mfa/challenge";
}
